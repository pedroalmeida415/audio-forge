import { eq, or } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { type DiarizationSegment, diarizationJobs } from "~/server/db/schema";
import {
  BUCKET_NAME,
  deleteObject,
  generateAudioFileKey,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "~/server/services/minio";
import {
  getJobStatus as getPyannoteJobStatus,
  startDiarization,
} from "~/server/services/pyannote";

export const diarizationRouter = createTRPCRouter({
  /**
   * Create a new diarization job for a single file
   * Jobs are global (not tied to projects)
   * Returns presigned upload URL for direct browser upload
   */
  createJob: publicProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        fileSizeBytes: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create job with pending status
      const [job] = await ctx.db
        .insert(diarizationJobs)
        .values({
          status: "pending",
          originalFilename: input.filename,
          mimeType: input.contentType,
          fileSizeBytes: input.fileSizeBytes,
          storageBucket: BUCKET_NAME,
        })
        .returning();

      if (!job) {
        throw new Error("Failed to create job");
      }

      // Generate storage key using the job ID
      const storageKey = generateAudioFileKey(job.id, input.filename);

      // Update job with storage key
      await ctx.db
        .update(diarizationJobs)
        .set({ storageKey })
        .where(eq(diarizationJobs.id, job.id));

      // Generate presigned upload URL
      const uploadUrl = await getPresignedUploadUrl(storageKey);

      return {
        jobId: job.id,
        uploadUrl,
        storageKey,
      };
    }),

  /**
   * Mark file upload as complete and ready for processing
   */
  confirmUpload: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        durationSeconds: z.number().positive().optional(),
        sampleRate: z.number().positive().optional(),
        channels: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "pending") {
        throw new Error("Job is not in pending state");
      }

      const [updatedJob] = await ctx.db
        .update(diarizationJobs)
        .set({
          status: "uploading",
          durationSeconds: input.durationSeconds,
          sampleRate: input.sampleRate,
          channels: input.channels,
        })
        .where(eq(diarizationJobs.id, input.jobId))
        .returning();

      return updatedJob;
    }),

  /**
   * Start processing - transfer to Pyannote and initiate diarization
   */
  startProcessing: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        pyannoteMediaUrl: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "uploading") {
        throw new Error("Job must be in uploading state");
      }

      try {
        // Start Pyannote diarization
        const result = await startDiarization({
          url: input.pyannoteMediaUrl,
          confidence: true,
        });

        // Update job with Pyannote info and status
        const [updatedJob] = await ctx.db
          .update(diarizationJobs)
          .set({
            status: "processing",
            pyannoteJobId: result.jobId,
            pyannoteMediaUrl: input.pyannoteMediaUrl,
            startedAt: new Date(),
          })
          .where(eq(diarizationJobs.id, input.jobId))
          .returning();

        return {
          success: true,
          pyannoteJobId: result.jobId,
          job: updatedJob,
        };
      } catch (error) {
        // Mark job as failed
        await ctx.db
          .update(diarizationJobs)
          .set({
            status: "failed",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to start processing",
          })
          .where(eq(diarizationJobs.id, input.jobId));

        throw error;
      }
    }),

  /**
   * Get job status - polls Pyannote and updates database
   */
  getJobStatus: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Polling logic requires multiple conditional checks for different Pyannote states
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // If job is processing, poll Pyannote for status
      if (job.status === "processing" && job.pyannoteJobId) {
        try {
          const pyannoteStatus = await getPyannoteJobStatus(job.pyannoteJobId);

          if (pyannoteStatus.status === "succeeded") {
            // Convert diarization results to JSONB segments
            const segments: DiarizationSegment[] =
              pyannoteStatus.output?.diarization?.map((seg, index) => ({
                id: crypto.randomUUID(),
                speaker: seg.speaker,
                start: seg.start,
                end: seg.end,
                confidence: seg.confidence,
              })) ?? [];

            // Update job with segments in JSONB and mark as completed
            await ctx.db
              .update(diarizationJobs)
              .set({
                status: "completed",
                completedAt: new Date(),
                segments,
              })
              .where(eq(diarizationJobs.id, job.id));

            // Return updated job
            return ctx.db.query.diarizationJobs.findFirst({
              where: eq(diarizationJobs.id, input.jobId),
            });
          }

          if (pyannoteStatus.status === "failed") {
            await ctx.db
              .update(diarizationJobs)
              .set({
                status: "failed",
                errorMessage: pyannoteStatus.error ?? "Diarization failed",
              })
              .where(eq(diarizationJobs.id, job.id));

            // Return updated job
            return ctx.db.query.diarizationJobs.findFirst({
              where: eq(diarizationJobs.id, input.jobId),
            });
          }

          // Still pending or running - return current job status
          return job;
        } catch (error) {
          // Error checking Pyannote status - return current job without updating
          console.error(
            `Error checking Pyannote status for job ${job.id}:`,
            error
          );
          return job;
        }
      }

      // Job not processing or no pyannoteJobId - return as-is
      return job;
    }),

  /**
   * Get a single job with all details (segments are in JSONB)
   * Also polls Pyannote and syncs results when job is processing
   */
  getJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Polling logic requires multiple conditional checks
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.id),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // If job is processing, poll Pyannote for status updates
      if (job.status === "processing" && job.pyannoteJobId) {
        try {
          const pyannoteStatus = await getPyannoteJobStatus(job.pyannoteJobId);

          if (pyannoteStatus.status === "succeeded") {
            // Convert diarization results to JSONB segments
            const segments: DiarizationSegment[] =
              pyannoteStatus.output?.diarization?.map((seg) => ({
                id: crypto.randomUUID(),
                speaker: seg.speaker,
                start: seg.start,
                end: seg.end,
                confidence: seg.confidence,
              })) ?? [];

            // Update job with segments in JSONB and mark as completed
            await ctx.db
              .update(diarizationJobs)
              .set({
                status: "completed",
                completedAt: new Date(),
                segments,
              })
              .where(eq(diarizationJobs.id, job.id));

            // Re-fetch and return updated job
            return ctx.db.query.diarizationJobs.findFirst({
              where: eq(diarizationJobs.id, input.id),
            });
          }

          if (pyannoteStatus.status === "failed") {
            await ctx.db
              .update(diarizationJobs)
              .set({
                status: "failed",
                errorMessage: pyannoteStatus.error ?? "Diarization failed",
              })
              .where(eq(diarizationJobs.id, job.id));

            // Return updated job
            return {
              ...job,
              status: "failed" as const,
              errorMessage: pyannoteStatus.error ?? "Diarization failed",
            };
          }

          // Still pending or running - return current job status
        } catch (error) {
          // Error checking Pyannote status - log but return current job
          console.error(
            `Error checking Pyannote status for job ${job.id}:`,
            error
          );
        }
      }

      return job;
    }),

  /**
   * List all jobs globally with optional status filter
   */
  listJobs: publicProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending", "uploading", "processing", "completed", "failed"])
            .optional(),
          limit: z.number().min(1).max(50).default(20),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const whereClause = input?.status
        ? eq(diarizationJobs.status, input.status)
        : or(
            eq(diarizationJobs.status, "completed"),
            eq(diarizationJobs.status, "processing"),
            eq(diarizationJobs.status, "pending"),
            eq(diarizationJobs.status, "uploading"),
            eq(diarizationJobs.status, "failed")
          );

      const jobs = await ctx.db.query.diarizationJobs.findMany({
        where: whereClause,
        limit: input?.limit ?? 20,
        offset: input?.offset ?? 0,
        orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      });

      // Return jobs with segment count derived from JSONB array
      return jobs.map((job) => ({
        ...job,
        segmentCount: (job.segments ?? []).length,
      }));
    }),

  /**
   * Get presigned URL for downloading/streaming audio file
   */
  getAudioUrl: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        columns: {
          storageKey: true,
        },
      });

      if (!job?.storageKey) {
        throw new Error("Job or storage key not found");
      }

      const url = await getPresignedDownloadUrl(job.storageKey);
      return { url };
    }),

  /**
   * Reassign a segment to a different speaker
   * Updates the segment's speaker field in the JSONB array
   */
  reassignSegmentSpeaker: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        segmentId: z.string().uuid(),
        newSpeaker: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "completed") {
        throw new Error("Can only modify segments of completed jobs");
      }

      const segments = (job.segments ?? []) as DiarizationSegment[];
      const segmentIndex = segments.findIndex((s) => s.id === input.segmentId);

      if (segmentIndex === -1) {
        throw new Error("Segment not found");
      }

      // Create updated segments array with new speaker
      const updatedSegments = [...segments];
      updatedSegments[segmentIndex] = {
        ...updatedSegments[segmentIndex]!,
        speaker: input.newSpeaker,
      };

      // Persist to database
      await ctx.db
        .update(diarizationJobs)
        .set({ segments: updatedSegments })
        .where(eq(diarizationJobs.id, input.jobId));

      return {
        success: true,
        segment: updatedSegments[segmentIndex],
      };
    }),

  /**
   * Delete a job and its storage
   */
  deleteJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.id),
        columns: {
          id: true,
          storageKey: true,
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // Delete from MinIO storage if storage key exists
      let storageError: string | undefined;
      if (job.storageKey) {
        try {
          await deleteObject(job.storageKey);
        } catch (error) {
          console.error(
            `Failed to delete file ${job.storageKey}:`,
            error instanceof Error ? error.message : "Unknown error"
          );
          storageError = job.storageKey;
        }
      }

      // Delete from database
      const [deleted] = await ctx.db
        .delete(diarizationJobs)
        .where(eq(diarizationJobs.id, input.id))
        .returning({ id: diarizationJobs.id });

      if (!deleted) {
        throw new Error("Failed to delete job");
      }

      return {
        success: true,
        deletedId: deleted.id,
        storageError,
      };
    }),
});

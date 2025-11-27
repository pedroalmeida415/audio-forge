import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { diarizationJobs, projects, segments } from "~/server/db/schema";
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

const MAX_CONCURRENT_JOBS = 10;

export const diarizationRouter = createTRPCRouter({
  /**
   * Create a new diarization job for a single file
   * Returns presigned upload URL for direct browser upload
   */
  createJob: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        fileSizeBytes: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project exists
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { id: true },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      // Check concurrent job limit (processing or uploading status)
      const [concurrentJobsResult] = await ctx.db
        .select({ count: count() })
        .from(diarizationJobs)
        .where(
          and(
            eq(diarizationJobs.projectId, input.projectId),
            eq(diarizationJobs.status, "processing")
          )
        );

      const [uploadingJobsResult] = await ctx.db
        .select({ count: count() })
        .from(diarizationJobs)
        .where(
          and(
            eq(diarizationJobs.projectId, input.projectId),
            eq(diarizationJobs.status, "uploading")
          )
        );

      const concurrentJobs =
        (concurrentJobsResult?.count ?? 0) + (uploadingJobsResult?.count ?? 0);

      if (concurrentJobs >= MAX_CONCURRENT_JOBS) {
        throw new Error(
          `Maximum ${MAX_CONCURRENT_JOBS} concurrent jobs allowed. Please wait for existing jobs to complete.`
        );
      }

      // Create job with pending status - will generate ID first
      const [job] = await ctx.db
        .insert(diarizationJobs)
        .values({
          projectId: input.projectId,
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

      // Generate storage key using the newly created job ID
      const storageKey = generateAudioFileKey(
        input.projectId,
        job.id,
        input.filename
      );

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
        pyannoteMediaUrl: z.string().url(),
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
            // Save segments to database
            if (pyannoteStatus.output?.diarization) {
              const segmentsToInsert = pyannoteStatus.output.diarization.map(
                (seg) => ({
                  jobId: job.id,
                  pyannoteSpeakerLabel: seg.speaker,
                  originalStartTime: seg.start,
                  originalEndTime: seg.end,
                  editedStartTime: seg.start,
                  editedEndTime: seg.end,
                  status: "pending" as const,
                })
              );

              if (segmentsToInsert.length > 0) {
                await ctx.db.insert(segments).values(segmentsToInsert);
              }
            }

            // Mark job as completed
            await ctx.db
              .update(diarizationJobs)
              .set({
                status: "completed",
                completedAt: new Date(),
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
   * Get a single job with all details including segments
   */
  getJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.id),
        with: {
          project: {
            columns: {
              id: true,
              name: true,
            },
          },
          segments: {
            orderBy: (segs, { asc }) => [asc(segs.editedStartTime)],
            with: {
              collection: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      return job;
    }),

  /**
   * List jobs for a project
   */
  listJobs: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.db.query.diarizationJobs.findMany({
        where: eq(diarizationJobs.projectId, input.projectId),
        limit: input.limit,
        offset: input.offset,
        orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      })
    ),

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

      // Delete from database (cascade will delete segments)
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

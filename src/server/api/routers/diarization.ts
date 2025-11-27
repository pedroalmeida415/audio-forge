import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  audioFiles,
  diarizationJobs,
  projects,
  segments,
} from "~/server/db/schema";
import {
  BUCKET_NAME,
  generateAudioFileKey,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "~/server/services/minio";
import {
  createMediaUploadUrl,
  getJobStatus as getPyannoteJobStatus,
  startDiarization,
} from "~/server/services/pyannote";

const MAX_FILES_PER_JOB = 10;

export const diarizationRouter = createTRPCRouter({
  /**
   * Create a new diarization job
   */
  createJob: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
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

      const [job] = await ctx.db
        .insert(diarizationJobs)
        .values({
          projectId: input.projectId,
          status: "pending",
          totalFiles: 0,
          processedFiles: 0,
        })
        .returning();

      return job;
    }),

  /**
   * Get a presigned URL for uploading an audio file
   */
  getUploadUrl: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        fileSizeBytes: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get job with project info
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        with: {
          audioFiles: {
            columns: { id: true },
          },
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // Check file limit
      if (job.audioFiles.length >= MAX_FILES_PER_JOB) {
        throw new Error(`Maximum ${MAX_FILES_PER_JOB} files per job`);
      }

      // Generate storage key
      const storageKey = generateAudioFileKey(
        job.projectId,
        job.id,
        input.filename
      );

      // Create audio file record
      const [audioFile] = await ctx.db
        .insert(audioFiles)
        .values({
          jobId: job.id,
          storageBucket: BUCKET_NAME,
          storageKey,
          originalFilename: input.filename,
          mimeType: input.contentType,
          fileSizeBytes: input.fileSizeBytes,
        })
        .returning();

      // Update job's total files count
      await ctx.db
        .update(diarizationJobs)
        .set({ totalFiles: job.audioFiles.length + 1 })
        .where(eq(diarizationJobs.id, job.id));

      // Generate presigned upload URL
      const uploadUrl = await getPresignedUploadUrl(
        storageKey,
        input.contentType
      );

      return {
        audioFileId: audioFile!.id,
        uploadUrl,
        storageKey,
      };
    }),

  /**
   * Mark file upload as complete and optionally start processing
   */
  confirmUpload: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
        durationSeconds: z.number().positive().optional(),
        sampleRate: z.number().positive().optional(),
        channels: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [audioFile] = await ctx.db
        .update(audioFiles)
        .set({
          durationSeconds: input.durationSeconds,
          sampleRate: input.sampleRate,
          channels: input.channels,
        })
        .where(eq(audioFiles.id, input.audioFileId))
        .returning();

      return audioFile;
    }),

  /**
   * Start processing all files in a job
   */
  startProcessing: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get job with files
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        with: {
          audioFiles: true,
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.audioFiles.length === 0) {
        throw new Error("No files to process");
      }

      if (job.status !== "pending") {
        throw new Error("Job already started or completed");
      }

      // Update job status
      await ctx.db
        .update(diarizationJobs)
        .set({
          status: "uploading",
          startedAt: new Date(),
        })
        .where(eq(diarizationJobs.id, job.id));

      // For each file, we need to:
      // 1. Get a presigned URL from Pyannote for their temp storage
      // 2. Stream the file from MinIO to Pyannote
      // 3. Start diarization job
      // This will be handled by a separate API route for streaming

      return { success: true, jobId: job.id, fileCount: job.audioFiles.length };
    }),

  /**
   * Process a single file through Pyannote
   * Called from the streaming API route after file transfer
   */
  processSingleFile: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
        pyannoteMediaUrl: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get audio file
      const audioFile = await ctx.db.query.audioFiles.findFirst({
        where: eq(audioFiles.id, input.audioFileId),
      });

      if (!audioFile) {
        throw new Error("Audio file not found");
      }

      try {
        // Start diarization
        const result = await startDiarization({
          url: input.pyannoteMediaUrl,
          confidence: true,
        });

        // Update audio file with Pyannote job info
        await ctx.db
          .update(audioFiles)
          .set({
            pyannoteJobId: result.jobId,
            pyannoteMediaUrl: input.pyannoteMediaUrl,
          })
          .where(eq(audioFiles.id, input.audioFileId));

        // Update parent job status to processing
        await ctx.db
          .update(diarizationJobs)
          .set({ status: "processing" })
          .where(eq(diarizationJobs.id, audioFile.jobId));

        return { pyannoteJobId: result.jobId };
      } catch (error) {
        // Mark file as failed
        await ctx.db
          .update(audioFiles)
          .set({
            processingError:
              error instanceof Error ? error.message : "Unknown error",
          })
          .where(eq(audioFiles.id, input.audioFileId));

        throw error;
      }
    }),

  /**
   * Check the status of a diarization job (polls Pyannote for each file)
   */
  getJobStatus: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        with: {
          audioFiles: true,
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // If job is still processing, check Pyannote status for each file
      if (job.status === "processing") {
        let allCompleted = true;
        let anyFailed = false;
        let processedCount = 0;

        for (const file of job.audioFiles) {
          if (file.processed) {
            processedCount++;
            continue;
          }

          if (!file.pyannoteJobId) {
            allCompleted = false;
            continue;
          }

          try {
            const pyannoteStatus = await getPyannoteJobStatus(
              file.pyannoteJobId
            );

            if (pyannoteStatus.status === "succeeded") {
              // Save segments to database
              if (pyannoteStatus.output?.diarization) {
                const segmentsToInsert = pyannoteStatus.output.diarization.map(
                  (seg) => ({
                    audioFileId: file.id,
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

              // Mark file as processed
              await ctx.db
                .update(audioFiles)
                .set({ processed: true })
                .where(eq(audioFiles.id, file.id));

              processedCount++;
            } else if (pyannoteStatus.status === "failed") {
              anyFailed = true;
              await ctx.db
                .update(audioFiles)
                .set({
                  processingError: pyannoteStatus.error ?? "Diarization failed",
                })
                .where(eq(audioFiles.id, file.id));
            } else {
              allCompleted = false;
            }
          } catch (error) {
            allCompleted = false;
          }
        }

        // Update job status
        if (allCompleted && processedCount === job.audioFiles.length) {
          await ctx.db
            .update(diarizationJobs)
            .set({
              status: "completed",
              processedFiles: processedCount,
              completedAt: new Date(),
            })
            .where(eq(diarizationJobs.id, job.id));
        } else if (anyFailed) {
          await ctx.db
            .update(diarizationJobs)
            .set({
              status: "failed",
              processedFiles: processedCount,
              errorMessage: "One or more files failed to process",
            })
            .where(eq(diarizationJobs.id, job.id));
        } else {
          await ctx.db
            .update(diarizationJobs)
            .set({ processedFiles: processedCount })
            .where(eq(diarizationJobs.id, job.id));
        }
      }

      // Return fresh job data
      const updatedJob = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        with: {
          audioFiles: {
            columns: {
              id: true,
              originalFilename: true,
              processed: true,
              processingError: true,
              durationSeconds: true,
            },
          },
        },
      });

      return updatedJob;
    }),

  /**
   * List diarization jobs for a project
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
        with: {
          audioFiles: {
            columns: {
              id: true,
              originalFilename: true,
              processed: true,
            },
          },
        },
      })
    ),

  /**
   * Get a single job by ID with all details
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
          audioFiles: {
            with: {
              segments: {
                orderBy: (segments, { asc }) => [asc(segments.editedStartTime)],
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
          },
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      return job;
    }),

  /**
   * Get presigned URL for downloading/streaming an audio file
   */
  getAudioUrl: publicProcedure
    .input(z.object({ audioFileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const audioFile = await ctx.db.query.audioFiles.findFirst({
        where: eq(audioFiles.id, input.audioFileId),
        columns: {
          storageKey: true,
        },
      });

      if (!audioFile) {
        throw new Error("Audio file not found");
      }

      const url = await getPresignedDownloadUrl(audioFile.storageKey);
      return { url };
    }),

  /**
   * Delete a job and all its files
   */
  deleteJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Also delete files from MinIO storage

      const [deleted] = await ctx.db
        .delete(diarizationJobs)
        .where(eq(diarizationJobs.id, input.id))
        .returning({ id: diarizationJobs.id });

      if (!deleted) {
        throw new Error("Job not found");
      }

      return { success: true, deletedId: deleted.id };
    }),

  /**
   * Create a Pyannote media upload URL (for the transfer API route)
   */
  getPyannoteUploadUrl: publicProcedure.mutation(async () => {
    const result = await createMediaUploadUrl();
    return result;
  }),
});

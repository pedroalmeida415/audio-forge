import { mkdtempSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { isVideoMimeType } from "~/lib/video-types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sources } from "~/server/db/schema";
import { AudioProcessingService } from "~/services/audio/audio-processing-service";
import { Database } from "~/services/infra/database";
import {
  AudioJobs,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";
import { StorageService } from "~/services/storage/storage-service";

export const fileRouter = createTRPCRouter({
  // Get presigned URL for uploading audio to R2
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        contentType: z.string().regex(/^audio\//),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          StorageService.generatePresignedUploadUrl({
            fileName: input.fileName,
            contentType: input.contentType,
            userId: ctx.session.user.id,
          }),
        ),
    ),

  // Create source record after upload
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        name: z.string().min(1).optional(),
        duration: z.number().positive().optional(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const fileName =
              input.name ?? input.storageKey.split("/").pop() ?? "Untitled";

            // Create source record
            const [source] = yield* db
              .insert(sources)
              .values({
                userId: ctx.session.user.id,
                projectId: input.projectId,
                storageKey: input.storageKey,
                name: fileName,
                originalFileName: fileName,
                duration: input.duration,
              })
              .returning();

            if (!source) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to create source record",
                }),
              );
            }

            // Enqueue waveform generation (fire and forget)
            yield* QueueService.enqueueJob(
              Queues.AudioProcessing,
              AudioJobs.GenerateWaveform,
              { entryId: source.id },
            ).pipe(
              Effect.catchAll((error) =>
                Effect.sync(() =>
                  console.error(
                    "[file.create] Failed to enqueue waveform job:",
                    error,
                  ),
                ),
              ),
            );

            return { source };
          }),
        ),
    ),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const source = yield* db.query.sources.findFirst({
              where: and(
                eq(sources.id, input.sourceId),
                eq(sources.userId, ctx.session.user.id),
              ),
            });

            if (!source) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Source not found",
                }),
              );
            }

            const storageKey = source.storageKey;
            if (!storageKey) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Audio file not found in storage",
                }),
              );
            }

            return yield* StorageService.generatePresignedDownloadUrl({
              key: storageKey,
              expiresIn: 3600,
            });
          }),
        ),
    ),

  // Delete a source (cascade will handle segments and clips)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const source = yield* db.query.sources.findFirst({
              where: and(
                eq(sources.id, input.id),
                eq(sources.userId, ctx.session.user.id),
              ),
            });

            if (!source) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Source not found",
                }),
              );
            }

            // Delete from storage if source exists (ignore errors)
            const storageKey = source.storageKey;
            if (storageKey) {
              yield* StorageService.deleteObject({ key: storageKey }).pipe(
                Effect.catchAll(() =>
                  Effect.sync(() =>
                    console.error("Failed to delete source from storage"),
                  ),
                ),
              );
            }

            // Delete source record (cascade handles related records)
            yield* db.delete(sources).where(eq(sources.id, input.id));

            return { success: true };
          }),
        ),
    ),

  // Upload video, extract audio to FLAC, and create source
  uploadVideo: protectedProcedure
    .input(octetInputParser)
    .mutation(async ({ ctx, input }) => {
      // Validate headers before entering Effect pipeline
      const contentType = ctx.headers.get("x-content-type");
      const projectId = ctx.headers.get("x-project-id");
      const filename = ctx.headers.get("x-filename") ?? "video";

      if (!contentType || !isVideoMimeType(contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file type. Expected a video file.",
        });
      }

      if (!projectId || !z.string().uuid().safeParse(projectId).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing or invalid x-project-id header",
        });
      }

      // projectId is validated above, safe to use
      const validProjectId = projectId;
      const baseFilename = filename.replace(/\.[^/.]+$/, "");

      // Run the entire upload pipeline as an Effect with resource management
      return await ctx.runtime.runPromise(
        Effect.acquireUseRelease(
          // Acquire: Create temp directory
          Effect.sync(() => mkdtempSync(join(tmpdir(), "video-extract-"))),

          // Use: Process the video
          (tempDir) =>
            Effect.gen(function* () {
              const db = yield* Database;
              const videoPath = join(tempDir, "input.video");
              const audioPath = join(tempDir, "output.flac");

              // 1. Stream video to temp file
              yield* Effect.tryPromise({
                try: async () => {
                  const fileHandle = await open(videoPath, "w");
                  try {
                    const reader = input.getReader();
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      await fileHandle.write(value);
                    }
                  } finally {
                    await fileHandle.close();
                  }
                },
                catch: (error) =>
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to write uploaded file to disk",
                    cause: error,
                  }),
              });

              // 2. Extract audio from video
              const extractionResult =
                yield* AudioProcessingService.extractFromVideo({
                  inputPath: videoPath,
                  outputPath: audioPath,
                }).pipe(
                  Effect.catchTag("AudioProcessingError", (error) =>
                    Effect.fail(
                      new TRPCError({
                        code:
                          error.code === "NO_AUDIO" ||
                          error.code === "CORRUPT_FILE"
                            ? "UNPROCESSABLE_CONTENT"
                            : "INTERNAL_SERVER_ERROR",
                        message: error.message,
                      }),
                    ),
                  ),
                );

              // 3. Upload FLAC to R2
              const storageKey = `diarization/${ctx.session.user.id}/${Date.now()}-${baseFilename}.flac`;
              yield* StorageService.uploadFromPath({
                localPath: audioPath,
                key: storageKey,
                contentType: "audio/flac",
              }).pipe(
                Effect.catchTag("StorageError", (error) =>
                  Effect.fail(
                    new TRPCError({
                      code: "INTERNAL_SERVER_ERROR",
                      message: error.message,
                    }),
                  ),
                ),
              );

              // 4. Create source record
              const [source] = yield* db
                .insert(sources)
                .values({
                  userId: ctx.session.user.id,
                  projectId: validProjectId,
                  storageKey,
                  name: `${baseFilename}.flac`,
                  originalFileName: `${baseFilename}.flac`,
                  duration: extractionResult.durationSeconds || null,
                })
                .returning();

              if (!source) {
                return yield* Effect.fail(
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create source record",
                  }),
                );
              }

              // 5. Enqueue waveform generation (fire and forget)
              yield* QueueService.enqueueJob(
                Queues.AudioProcessing,
                AudioJobs.GenerateWaveform,
                { entryId: source.id },
              ).pipe(
                Effect.catchAll((error) =>
                  Effect.sync(() =>
                    console.error(
                      "[uploadVideo] Failed to enqueue waveform job:",
                      error,
                    ),
                  ),
                ),
              );

              return { source };
            }),

          // Release: Always cleanup temp directory
          (tempDir) =>
            Effect.sync(() => {
              try {
                rmSync(tempDir, { recursive: true, force: true });
              } catch {
                console.error(
                  "[uploadVideo] Failed to cleanup temp directory:",
                  tempDir,
                );
              }
            }),
        ),
      );
    }),

  // Get waveform status and URL
  getWaveformUrl: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const source = yield* db.query.sources.findFirst({
              where: and(
                eq(sources.id, input.sourceId),
                eq(sources.userId, ctx.session.user.id),
              ),
              columns: {
                waveformStatus: true,
                waveformStorageKey: true,
                waveformError: true,
              },
            });

            if (!source) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Source not found",
                }),
              );
            }

            // Return status info if not completed
            if (
              source.waveformStatus !== "completed" ||
              !source.waveformStorageKey
            ) {
              return {
                status: source.waveformStatus ?? "pending",
                url: null,
                error: source.waveformError,
              };
            }

            // Generate presigned URL for completed waveform
            const url = yield* StorageService.generatePresignedDownloadUrl({
              key: source.waveformStorageKey,
              expiresIn: 3600,
            });

            return {
              status: "completed" as const,
              url,
              error: null,
            };
          }),
        ),
    ),
});

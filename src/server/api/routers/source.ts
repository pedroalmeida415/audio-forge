import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";
import { and, eq, inArray, not } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { projects, segments, sources, speakers } from "~/server/db/schema";
import { PyannoteService } from "~/services/diarization/pyannote-service";
import { Database } from "~/services/infra/database";
import {
  AudioJobs,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";
import { StorageService } from "~/services/storage/storage-service";

const PROJECT_ID_SCHEMA = z.string().uuid();
const SUPPORTED_UPLOAD_CONTENT_TYPE = /^(audio|video)\//;
const MAX_FILENAME_LENGTH = 255;
const sourceBulkPatchSchema = z
  .object({
    speakerId: z.string().uuid().optional(),
  })
  .strict();

function normalizeFilename(value: string): string {
  const safeName = basename(value).trim();
  if (!safeName) {
    return "upload";
  }
  return safeName.slice(0, MAX_FILENAME_LENGTH);
}

function hasSourceBulkPatchFields(
  patch: z.infer<typeof sourceBulkPatchSchema>,
): boolean {
  return Object.values(patch).some((value) => value !== undefined);
}

function parseBooleanHeader(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export const sourceRouter = createTRPCRouter({
  upload: protectedProcedure.input(octetInputParser).mutation(
    async ({ ctx, input }) =>
      await ctx.runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* Database;

          const contentType = ctx.headers.get("x-content-type")?.toLowerCase();
          const projectId = ctx.headers.get("x-project-id");
          const rawFilename = ctx.headers.get("x-filename") ?? "upload";
          const queueDiarization = parseBooleanHeader(
            ctx.headers.get("x-queue-diarization"),
          );

          if (
            !contentType ||
            !SUPPORTED_UPLOAD_CONTENT_TYPE.test(contentType)
          ) {
            return yield* Effect.fail(
              new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid x-content-type header",
              }),
            );
          }

          if (!projectId || !PROJECT_ID_SCHEMA.safeParse(projectId).success) {
            return yield* Effect.fail(
              new TRPCError({
                code: "BAD_REQUEST",
                message: "Missing or invalid x-project-id header",
              }),
            );
          }

          const filename = normalizeFilename(rawFilename);
          const project = yield* db.query.projects.findFirst({
            where: and(
              eq(projects.id, projectId),
              eq(projects.userId, ctx.session.user.id),
            ),
            columns: { id: true },
          });

          if (!project) {
            return yield* Effect.fail(
              new TRPCError({
                code: "NOT_FOUND",
                message: "Project not found",
              }),
            );
          }

          const stagingDir = join(tmpdir(), "audio-forge-staging");
          yield* Effect.tryPromise({
            try: () => mkdir(stagingDir, { recursive: true }),
            catch: (error) =>
              new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to initialize staging directory",
                cause: error,
              }),
          });

          const stagingPath = join(
            stagingDir,
            `${Date.now()}-${randomUUID()}-${filename}`,
          );

          yield* Effect.tryPromise({
            try: async () => {
              const readableStream = Readable.fromWeb(
                input as unknown as NodeReadableStream<Uint8Array>,
              );
              const writableStream = createWriteStream(stagingPath, {
                flags: "w",
              });

              await pipeline(readableStream, writableStream);
            },
            catch: (error) =>
              new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to stage uploaded source",
                cause: error,
              }),
          });

          const [source] = yield* db
            .insert(sources)
            .values({
              userId: ctx.session.user.id,
              projectId,
              name: filename,
              originalFileName: filename,
              ingestStatus: "pending",
              ingestError: null,
              ingestLocalPath: stagingPath,
              ingestContentType: contentType,
              ingestOriginalFilename: filename,
              waveformStatus: "pending",
              waveformError: null,
            })
            .returning({ id: sources.id });

          if (!source) {
            return yield* Effect.fail(
              new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create source record",
              }),
            );
          }

          yield* QueueService.enqueueJob(
            Queues.AudioProcessing,
            AudioJobs.IngestSource,
            {
              entryId: source.id,
              queueDiarization,
            },
          ).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                const message =
                  error instanceof Error
                    ? error.message
                    : "Failed to enqueue ingest job";

                yield* db
                  .update(sources)
                  .set({
                    ingestStatus: "failed",
                    ingestError: message,
                    waveformStatus: "failed",
                    waveformError: message,
                  })
                  .where(eq(sources.id, source.id));

                return yield* Effect.fail(
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message,
                  }),
                );
              }),
            ),
          );

          return { sourceId: source.id };
        }),
      ),
  ),

  getIngestStatus: protectedProcedure
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
                ingestStatus: true,
                ingestError: true,
                waveformStatus: true,
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

            return {
              ingestStatus: source.ingestStatus ?? "pending",
              ingestError: source.ingestError,
              waveformStatus: source.waveformStatus ?? "pending",
              waveformError: source.waveformError,
            };
          }),
        ),
    ),

  // Get source by ID (metadata + waveform payload only)
  getById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(
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

          const { waveformData, ...sourceWithoutWaveformData } = source;

          return {
            ...sourceWithoutWaveformData,
            waveformBase64:
              source.waveformStatus === "completed" && waveformData
                ? waveformData.toString("base64")
                : null,
          };
        }),
      ),
  ),

  // List sources for a project
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            return yield* db.query.sources.findMany({
              where: and(
                eq(sources.projectId, input.projectId),
                eq(sources.userId, ctx.session.user.id),
              ),
              orderBy: (s, { desc }) => [desc(s.createdAt)],
              columns: {
                id: true,
                name: true,
                storageKey: true,
                duration: true,
                ingestStatus: true,
                ingestError: true,
                waveformStatus: true,
                waveformError: true,
                diarizationStatus: true,
                createdAt: true,
              },
            });
          }),
        ),
    ),

  // Rename source
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
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

            yield* db
              .update(sources)
              .set({ name: input.name })
              .where(eq(sources.id, input.id));

            return { success: true };
          }),
        ),
    ),

  // Delete source
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
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

            if (source.storageKey) {
              yield* StorageService.delete({ key: source.storageKey }).pipe(
                Effect.catchAll((error) =>
                  Effect.fail(
                    new TRPCError({
                      code: "INTERNAL_SERVER_ERROR",
                      message: `Failed to delete source audio from R2: ${error.message}`,
                    }),
                  ),
                ),
              );
            }

            yield* db.delete(sources).where(eq(sources.id, input.id));

            return { success: true };
          }),
        ),
    ),

  // Start diarization for this source
  startDiarization: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        numSpeakers: z.number().int().min(1).max(20).optional(),
      }),
    )
    .mutation(
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

            if (!source.storageKey) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Source has no audio data",
                }),
              );
            }

            if (source.diarizationStatus === "completed") {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Source has already been diarized",
                }),
              );
            }

            // Generate presigned download URL for Pyannote
            const { url: audioUrl } =
              yield* StorageService.generatePresignedUrl({
                key: source.storageKey,
                operation: "download",
                expiresIn: 7200,
              });

            // Submit diarization job
            const jobResult = yield* PyannoteService.submitJob({
              audioUrl,
            }).pipe(
              Effect.catchTag("PyannoteError", (error) =>
                Effect.fail(
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error.message,
                  }),
                ),
              ),
            );

            // Update source with diarization info
            yield* db
              .update(sources)
              .set({
                diarizationJobId: jobResult.jobId,
                diarizationStatus: "pending",
                diarizationStartedAt: new Date(),
                diarizationError: null,
              })
              .where(eq(sources.id, input.sourceId));

            return {
              sourceId: source.id,
              jobId: jobResult.jobId,
              status: jobResult.status,
              warning: jobResult.warning,
            };
          }),
        ),
    ),

  // Get diarization status
  getDiarizationStatus: protectedProcedure
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

            if (!source.diarizationStatus) {
              return { status: null };
            }

            // If not completed, fetch latest status from Pyannote
            if (
              source.diarizationStatus === "pending" ||
              source.diarizationStatus === "running"
            ) {
              if (!source.diarizationJobId) {
                return {
                  status: source.diarizationStatus,
                  liveStatus: source.diarizationStatus,
                  startedAt: source.diarizationStartedAt?.toISOString() ?? null,
                  completedAt: null,
                  error: source.diarizationError,
                };
              }

              const statusResult = yield* PyannoteService.getJobStatus(
                source.diarizationJobId,
              ).pipe(
                Effect.catchTag("PyannoteError", () =>
                  Effect.succeed({ status: source.diarizationStatus }),
                ),
              );

              return {
                status: source.diarizationStatus,
                liveStatus: statusResult.status,
                startedAt: source.diarizationStartedAt?.toISOString() ?? null,
                completedAt: null,
                error: null,
              };
            }

            return {
              status: source.diarizationStatus,
              startedAt: source.diarizationStartedAt?.toISOString() ?? null,
              completedAt: source.diarizationCompletedAt?.toISOString() ?? null,
              error: source.diarizationError,
            };
          }),
        ),
    ),

  deleteSegments: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        speakerId: z.string().uuid(),
        excludeSegmentIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(
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

            const speaker = yield* db.query.speakers.findFirst({
              where: and(
                eq(speakers.id, input.speakerId),
                eq(speakers.userId, ctx.session.user.id),
              ),
            });
            if (!speaker) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Speaker not found",
                }),
              );
            }

            const conditions = [
              eq(segments.sourceId, input.sourceId),
              eq(segments.speakerId, input.speakerId),
            ];

            const excludedSegmentIds = [
              ...new Set(input.excludeSegmentIds ?? []),
            ];
            if (excludedSegmentIds.length > 0) {
              conditions.push(not(inArray(segments.id, excludedSegmentIds)));
            }

            const deletedSegments = yield* db
              .delete(segments)
              .where(and(...conditions))
              .returning({ id: segments.id });

            return { success: true, deletedCount: deletedSegments.length };
          }),
        ),
    ),

  updateSegments: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        speakerId: z.string().uuid(),
        excludeSegmentIds: z.array(z.string().uuid()).optional(),
        patch: sourceBulkPatchSchema.refine(hasSourceBulkPatchFields, {
          message: "Patch cannot be empty",
        }),
      }),
    )
    .mutation(
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

            const currentSpeaker = yield* db.query.speakers.findFirst({
              where: and(
                eq(speakers.id, input.speakerId),
                eq(speakers.userId, ctx.session.user.id),
              ),
            });
            if (!currentSpeaker) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Speaker not found",
                }),
              );
            }

            if (input.patch.speakerId !== undefined) {
              const targetSpeaker = yield* db.query.speakers.findFirst({
                where: and(
                  eq(speakers.id, input.patch.speakerId),
                  eq(speakers.userId, ctx.session.user.id),
                ),
              });
              if (!targetSpeaker) {
                return yield* Effect.fail(
                  new TRPCError({
                    code: "NOT_FOUND",
                    message: "Target speaker not found",
                  }),
                );
              }
            }

            const conditions = [
              eq(segments.sourceId, input.sourceId),
              eq(segments.speakerId, input.speakerId),
            ];
            const excludedSegmentIds = [
              ...new Set(input.excludeSegmentIds ?? []),
            ];
            if (excludedSegmentIds.length > 0) {
              conditions.push(not(inArray(segments.id, excludedSegmentIds)));
            }

            const updatedSegments = yield* db
              .update(segments)
              .set({
                ...(input.patch.speakerId !== undefined && {
                  speakerId: input.patch.speakerId,
                }),
              })
              .where(and(...conditions))
              .returning({ id: segments.id });

            if (
              input.patch.speakerId !== undefined &&
              currentSpeaker.origin === "diarization" &&
              excludedSegmentIds.length === 0
            ) {
              yield* db
                .delete(speakers)
                .where(eq(speakers.id, input.speakerId));
            }

            return { success: true, updatedCount: updatedSegments.length };
          }),
        ),
    ),
});

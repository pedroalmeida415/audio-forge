import { randomUUID } from "node:crypto";
import { on } from "node:events";
import { mkdir, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { projects, sources } from "~/server/db/schema";
import {
  type DiarizationEvent,
  diarizationEvents,
} from "~/server/events/diarization-events";
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

function normalizeFilename(value: string): string {
  const safeName = basename(value).trim();
  if (!safeName) {
    return "upload";
  }
  return safeName.slice(0, MAX_FILENAME_LENGTH);
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
              const fileHandle = await open(stagingPath, "w");
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
            { entryId: source.id },
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

            // Generate presigned download URL for Pyannote
            const audioUrl = yield* StorageService.generatePresignedDownloadUrl(
              {
                key: source.storageKey,
                expiresIn: 7200,
              },
            );

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

  // Subscribe to diarization completion events
  onDiarizationComplete: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .subscription(async function* (opts) {
      const { sourceId } = opts.input;

      const eventName = `diarization:${sourceId}`;

      for await (const [event] of on(diarizationEvents, eventName, {
        signal: opts.signal,
      })) {
        const diarizationEvent = event as DiarizationEvent;
        yield diarizationEvent;

        if (
          diarizationEvent.status === "completed" ||
          diarizationEvent.status === "failed"
        ) {
          return;
        }
      }
    }),
});

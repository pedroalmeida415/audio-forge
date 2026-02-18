import { on } from "node:events";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sources, speakers } from "~/server/db/schema";
import {
  type DiarizationEvent,
  diarizationEvents,
} from "~/server/events/diarization-events";
import { PyannoteService } from "~/services/diarization/pyannote-service";
import { Database } from "~/services/infra/database";
import { StorageService } from "~/services/storage/storage-service";

export const sourceRouter = createTRPCRouter({
  // Get source by ID with segments and speakers
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
            with: {
              segments: {
                orderBy: (seg, { asc }) => [asc(seg.startTime)],
              },
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

          // Get all project speakers
          const projectSpeakers = yield* db.query.speakers.findMany({
            where: eq(speakers.projectId, source.projectId!),
            orderBy: (sp, { asc }) => [asc(sp.createdAt)],
          });

          return {
            ...source,
            speakers: projectSpeakers,
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
              const statusResult = yield* PyannoteService.getJobStatus(
                source.diarizationJobId!,
              ).pipe(
                Effect.catchTag("PyannoteError", () =>
                  Effect.succeed({ status: source.diarizationStatus! }),
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
              completedAt:
                source.diarizationCompletedAt?.toISOString() ?? null,
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

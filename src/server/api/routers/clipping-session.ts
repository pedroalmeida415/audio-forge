import { on } from "node:events";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clippingSessions,
  type DiarizationInfo,
  type SegmentWithSource,
  type SpeakerWithSource,
  speakers,
} from "~/server/db/schema";
import {
  type DiarizationEvent,
  diarizationEvents,
} from "~/server/events/diarization-events";
import { PyannoteService } from "~/services/diarization/pyannote-service";
import { Database } from "~/services/infra/database";
import { StorageService } from "~/services/storage/storage-service";

export const clippingSessionRouter = createTRPCRouter({
  // Get session by ID with file, segments, and speakers
  // Returns unified segments and speakers with source discrimination
  getById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(
    async ({ ctx, input }) =>
      await ctx.runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* Database;
          const session = yield* db.query.clippingSessions.findFirst({
            where: and(
              eq(clippingSessions.id, input.id),
              eq(clippingSessions.userId, ctx.session.user.id),
            ),
            with: {
              file: true,
              project: true,
              segments: {
                orderBy: (seg, { asc }) => [asc(seg.startTime)],
              },
            },
          });

          if (!session) {
            return yield* Effect.fail(
              new TRPCError({
                code: "NOT_FOUND",
                message: "Clipping session not found",
              }),
            );
          }

          // Get all project speakers (shown regardless of whether they have segments)
          const projectSpeakersRaw = yield* db.query.speakers.findMany({
            where: eq(speakers.projectId, session.projectId),
            orderBy: (sp, { asc }) => [asc(sp.createdAt)],
          });

          // Add source to project segments
          const projectSegments: SegmentWithSource[] = session.segments.map(
            (s) => ({
              ...s,
              source: "project" as const,
            }),
          );

          // Add source to project speakers
          const projectSpeakers: SpeakerWithSource[] = projectSpeakersRaw.map(
            (s) => ({
              ...s,
              source: "project" as const,
            }),
          );

          // Extract local speakers/segments from diarization JSONB
          const localSpeakersRaw = session.diarization?.speakers ?? [];
          const localSegmentsRaw = session.diarization?.segments ?? [];

          // Convert local speakers to SpeakerWithSource format
          const localSpeakers: SpeakerWithSource[] = localSpeakersRaw.map(
            (s) => ({
              id: s.id,
              projectId: session.projectId,
              userId: session.userId,
              name: s.label,
              color: s.color,
              createdAt: new Date(s.createdAt),
              updatedAt: new Date(s.createdAt),
              source: "local" as const,
            }),
          );

          // Convert local segments to SegmentWithSource format
          const localSegments: SegmentWithSource[] = localSegmentsRaw.map(
            (s) => ({
              id: s.id,
              sessionId: session.id,
              speakerId: s.speakerId,
              startTime: s.startTime,
              endTime: s.endTime,
              createdAt: new Date(s.createdAt),
              updatedAt: new Date(s.createdAt),
              source: "local" as const,
            }),
          );

          // Flatten and sort segments by start time
          const unifiedSegments = [...projectSegments, ...localSegments].sort(
            (a, b) => a.startTime - b.startTime,
          );

          // Flatten speakers (project first, then local)
          const unifiedSpeakers = [...projectSpeakers, ...localSpeakers];

          return {
            ...session,
            segments: unifiedSegments,
            speakers: unifiedSpeakers,
          };
        }),
      ),
  ),

  // List sessions for a project
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            return yield* db.query.clippingSessions.findMany({
              where: and(
                eq(clippingSessions.projectId, input.projectId),
                eq(clippingSessions.userId, ctx.session.user.id),
              ),
              orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
              columns: {
                id: true,
                name: true,
                createdAt: true,
              },
              with: {
                file: {
                  columns: {
                    id: true,
                    name: true,
                    storageKey: true,
                  },
                },
              },
            });
          }),
        ),
    ),

  // Rename session
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
            const session = yield* db.query.clippingSessions.findFirst({
              where: and(
                eq(clippingSessions.id, input.id),
                eq(clippingSessions.userId, ctx.session.user.id),
              ),
            });

            if (!session) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Clipping session not found",
                }),
              );
            }

            yield* db
              .update(clippingSessions)
              .set({ name: input.name })
              .where(eq(clippingSessions.id, input.id));

            return { success: true };
          }),
        ),
    ),

  // Start diarization for this session
  startDiarization: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        numSpeakers: z.number().int().min(1).max(20).optional(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // 1. Get the session with file
            const session = yield* db.query.clippingSessions.findFirst({
              where: and(
                eq(clippingSessions.id, input.sessionId),
                eq(clippingSessions.userId, ctx.session.user.id),
              ),
              with: {
                file: true,
              },
            });

            if (!session) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Clipping session not found",
                }),
              );
            }

            if (!session.file?.storageKey) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "File has no audio data",
                }),
              );
            }

            // 2. Generate presigned download URL for Pyannote
            const audioUrl = yield* StorageService.generatePresignedDownloadUrl(
              {
                key: session.file.storageKey,
                expiresIn: 7200, // 2 hours for processing
              },
            );

            // 3. Submit diarization job
            const jobResult = yield* PyannoteService.submitJob({
              audioUrl,
              numSpeakers: input.numSpeakers,
              confidence: true,
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

            // 4. Update session with diarization info
            const diarizationInfo: DiarizationInfo = {
              jobId: jobResult.jobId,
              status: "pending",
              startedAt: new Date().toISOString(),
              completedAt: null,
              error: null,
            };

            yield* db
              .update(clippingSessions)
              .set({ diarization: diarizationInfo })
              .where(eq(clippingSessions.id, input.sessionId));

            return {
              sessionId: session.id,
              jobId: jobResult.jobId,
              status: jobResult.status,
              warning: jobResult.warning,
            };
          }),
        ),
    ),

  // Get diarization status (polls Pyannote if still processing)
  getDiarizationStatus: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const session = yield* db.query.clippingSessions.findFirst({
              where: and(
                eq(clippingSessions.id, input.sessionId),
                eq(clippingSessions.userId, ctx.session.user.id),
              ),
            });

            if (!session) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Clipping session not found",
                }),
              );
            }

            if (!session.diarization) {
              return { status: null };
            }

            // If not completed, fetch latest status from Pyannote
            if (
              session.diarization.status === "pending" ||
              session.diarization.status === "running"
            ) {
              const diarizationStatus = session.diarization.status;
              const statusResult = yield* PyannoteService.getJobStatus(
                session.diarization.jobId,
              ).pipe(
                Effect.catchTag("PyannoteError", () =>
                  Effect.succeed({ status: diarizationStatus }),
                ),
              );

              return {
                ...session.diarization,
                liveStatus: statusResult.status,
              };
            }

            return session.diarization;
          }),
        ),
    ),

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Subscribe to diarization completion events for a session.
   *
   * The client establishes an SSE connection and receives events when
   * diarization completes or fails. On receiving a "completed" event,
   * the client should refetch session data to get the new segments/speakers.
   */
  onDiarizationComplete: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .subscription(async function* (opts) {
      const { sessionId } = opts.input;

      // Create an async iterable from the EventEmitter
      const eventName = `diarization:${sessionId}`;

      // Listen for events using Node.js on() which returns an async iterable
      for await (const [event] of on(diarizationEvents, eventName, {
        signal: opts.signal,
      })) {
        const diarizationEvent = event as DiarizationEvent;
        yield diarizationEvent;

        // After yielding completion, we can stop listening
        // The client will close the connection and refetch data
        if (
          diarizationEvent.status === "completed" ||
          diarizationEvent.status === "failed"
        ) {
          return;
        }
      }
    }),
});

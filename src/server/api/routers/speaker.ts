import { TRPCError } from "@trpc/server";
import { and, avg, count, eq, sql, sum } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { generateSpeakerColor } from "~/lib/speaker-colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clippingSessions,
  clips,
  segments,
  speakers,
} from "~/server/db/schema";
import { Database } from "~/services/infra/database";

export const speakerRouter = createTRPCRouter({
  // Get speaker by ID with aggregate stats
  getById: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
      }),
    )
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Get speaker details
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

            // Get aggregate stats for the speaker
            const statsResult = yield* Effect.tryPromise({
              try: () =>
                db
                  .select({
                    totalSegments: count(segments.id),
                    totalDuration: sum(
                      sql<number>`${segments.endTime} - ${segments.startTime}`,
                    ),
                    transcribedCount: count(
                      sql`CASE WHEN ${segments.transcription} IS NOT NULL THEN 1 END`,
                    ),
                    avgScore: avg(segments.score),
                  })
                  .from(segments)
                  .where(eq(segments.speakerId, input.speakerId)),
              catch: (error) =>
                new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to fetch segment stats",
                  cause: error,
                }),
            });

            // Get clips count for this speaker's segments
            const clipsCountResult = yield* Effect.tryPromise({
              try: () =>
                db
                  .select({ clipsCount: count(clips.id) })
                  .from(clips)
                  .innerJoin(segments, eq(clips.segmentId, segments.id))
                  .where(eq(segments.speakerId, input.speakerId)),
              catch: (error) =>
                new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to fetch clips count",
                  cause: error,
                }),
            });

            const stats = statsResult[0] ?? {
              totalSegments: 0,
              totalDuration: 0,
              transcribedCount: 0,
              avgScore: null,
            };
            const clipsCount = clipsCountResult[0]?.clipsCount ?? 0;

            return {
              speaker,
              stats: {
                totalSegments: Number(stats.totalSegments),
                totalDuration: Number(stats.totalDuration ?? 0),
                clipsCount: Number(clipsCount),
                transcribedCount: Number(stats.transcribedCount),
                avgScore:
                  stats.avgScore !== null ? Number(stats.avgScore) : null,
              },
            };
          }),
        ),
    ),

  // Create a new speaker (project-level)
  createSpeaker: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(100),
        color: z.string().optional(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Insert speaker at project level
            const [newSpeaker] = yield* db
              .insert(speakers)
              .values({
                projectId: input.projectId,
                userId: ctx.session.user.id,
                name: input.name,
                color: input.color ?? generateSpeakerColor(),
              })
              .returning();

            return {
              success: true,
              speaker: newSpeaker,
            };
          }),
        ),
    ),

  // Update a project speaker (name and/or color)
  updateSpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Get speaker to verify ownership
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

            yield* db
              .update(speakers)
              .set({
                ...(input.name !== undefined && { name: input.name }),
                ...(input.color !== undefined && { color: input.color }),
              })
              .where(eq(speakers.id, input.speakerId));

            return { success: true };
          }),
        ),
    ),

  // Update a local speaker (stored in diarization JSONB)
  updateLocalSpeaker: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        speakerId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(
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

            if (!session.diarization?.speakers) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "No local speakers in this session",
                }),
              );
            }

            // Find and update the local speaker
            const speakerIndex = session.diarization.speakers.findIndex(
              (s) => s.id === input.speakerId,
            );

            if (speakerIndex === -1) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Local speaker not found",
                }),
              );
            }

            // Create updated speakers array
            const updatedSpeakers = [...session.diarization.speakers];
            updatedSpeakers[speakerIndex] = {
              ...updatedSpeakers[speakerIndex]!,
              ...(input.name !== undefined && { label: input.name }),
              ...(input.color !== undefined && { color: input.color }),
            };

            // Update session with modified diarization
            yield* db
              .update(clippingSessions)
              .set({
                diarization: {
                  ...session.diarization,
                  speakers: updatedSpeakers,
                },
              })
              .where(eq(clippingSessions.id, input.sessionId));

            return { success: true };
          }),
        ),
    ),

  // Delete a local speaker and their segments from a session
  // Only works for local speakers (stored in diarization JSONB)
  // Project speakers cannot be deleted from inside the clipping session
  deleteSpeakerFromSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        speakerId: z.string().uuid(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Verify session ownership
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

            // Check if speaker is local (stored in diarization JSONB)
            const localSpeakerIds = new Set(
              session.diarization?.speakers?.map((s) => s.id) ?? [],
            );

            if (!localSpeakerIds.has(input.speakerId)) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "Project speakers cannot be deleted from inside the clipping session",
                }),
              );
            }

            // Remove speaker and their segments from JSONB
            const updatedSpeakers = (
              session.diarization?.speakers ?? []
            ).filter((s) => s.id !== input.speakerId);
            const updatedSegments = (
              session.diarization?.segments ?? []
            ).filter((s) => s.speakerId !== input.speakerId);

            // Update session with modified diarization
            yield* db
              .update(clippingSessions)
              .set({
                diarization: {
                  ...session.diarization!,
                  speakers: updatedSpeakers,
                  segments: updatedSegments,
                },
              })
              .where(eq(clippingSessions.id, input.sessionId));

            return { success: true };
          }),
        ),
    ),

  // Get all speakers for a project (for speaker picker)
  getProjectSpeakers: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        includeDiarization: z.boolean().default(true),
      }),
    )
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const allSpeakers = yield* db.query.speakers.findMany({
              where: and(
                eq(speakers.projectId, input.projectId),
                eq(speakers.userId, ctx.session.user.id),
              ),
              orderBy: (sp, { asc }) => [asc(sp.name)],
            });

            // Filter out SPEAKER_* if not including diarization speakers
            if (!input.includeDiarization) {
              return allSpeakers.filter((s) => !s.name.startsWith("SPEAKER_"));
            }

            return allSpeakers;
          }),
        ),
    ),
});

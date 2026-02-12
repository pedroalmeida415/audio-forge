import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { generateSpeakerColor } from "~/lib/speaker-colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { speakers } from "~/server/db/schema";
import { Database } from "~/services/infra/database";

export const speakerRouter = createTRPCRouter({
  // Get speaker by ID
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

            return speaker;
          }),
        ),
    ),

  // Get speaker stats (stub with mocked values for now)
  getStats: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
      }),
    )
    .query(async () => {
      // TODO: Implement real stats when requirements are clear
      return {
        totalSegments: 0,
        totalDuration: 0,
        clipsCount: 0,
        transcribedCount: 0,
        avgScore: null as number | null,
      };
    }),

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

            const [newSpeaker] = yield* db
              .insert(speakers)
              .values({
                projectId: input.projectId,
                userId: ctx.session.user.id,
                name: input.name,
                color: input.color ?? generateSpeakerColor(),
                origin: "user",
              })
              .returning();

            return {
              success: true,
              speaker: newSpeaker,
            };
          }),
        ),
    ),

  // Update a speaker (name and/or color)
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

  // Delete a speaker (cascade handles segments)
  deleteSpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

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

            yield* db.delete(speakers).where(eq(speakers.id, input.speakerId));

            return { success: true };
          }),
        ),
    ),

  // Get project-level speakers (excludes source-linked diarization speakers)
  getAllByProjectId: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            return yield* db.query.speakers.findMany({
              where: and(
                eq(speakers.projectId, input.projectId),
                eq(speakers.userId, ctx.session.user.id),
                isNull(speakers.sourceId),
              ),
              orderBy: (sp, { asc }) => [asc(sp.name)],
            });
          }),
        ),
    ),

  // Get diarization speakers linked to a specific source
  getAllBySourceId: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            return yield* db.query.speakers.findMany({
              where: and(
                eq(speakers.sourceId, input.sourceId),
                eq(speakers.userId, ctx.session.user.id),
              ),
              orderBy: (sp, { asc }) => [asc(sp.name)],
            });
          }),
        ),
    ),
});

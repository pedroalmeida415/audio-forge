import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, not } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { generateSpeakerColor } from "~/lib/speaker-colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { segments, speakers } from "~/server/db/schema";
import { Database } from "~/services/infra/database";

const speakerBulkPatchSchema = z
  .object({
    speakerId: z.string().uuid().optional(),
  })
  .strict();

function hasSpeakerBulkPatchFields(
  patch: z.infer<typeof speakerBulkPatchSchema>,
): boolean {
  return Object.values(patch).some((value) => value !== undefined);
}

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

  // Create a new speaker (project-level, optionally linked to a source)
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(100),
        color: z.string().optional(),
        sourceId: z.string().uuid().optional(),
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
                sourceId: input.sourceId ?? null,
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
  update: protectedProcedure
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
  delete: protectedProcedure
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

  deleteSegments: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        excludeSegmentIds: z.array(z.string().uuid()).optional(),
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

            const conditions = [eq(segments.speakerId, input.speakerId)];
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
        speakerId: z.string().uuid(),
        excludeSegmentIds: z.array(z.string().uuid()).optional(),
        patch: speakerBulkPatchSchema.refine(hasSpeakerBulkPatchFields, {
          message: "Patch cannot be empty",
        }),
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

            const conditions = [eq(segments.speakerId, input.speakerId)];
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
              speaker.origin === "diarization" &&
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

  // Get project-level speakers (excludes source-linked diarization speakers)
  getByProject: protectedProcedure
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
  getBySource: protectedProcedure
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

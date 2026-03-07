import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { segments, sources, speakers } from "~/server/db/schema";
import { Database } from "~/services/infra/database";
import {
  type AudioJobPayload,
  AudioJobs,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";

const segmentPatchSchema = z
  .object({
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    speakerId: z.string().uuid().optional(),
    transcription: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
  })
  .strict();

function hasPatchFields(patch: z.infer<typeof segmentPatchSchema>): boolean {
  return Object.values(patch).some((value) => value !== undefined);
}

export const segmentRouter = createTRPCRouter({
  getBySpeaker: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
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

            const items = yield* db.query.segments.findMany({
              where: eq(segments.speakerId, input.speakerId),
              orderBy: [asc(segments.startTime)],
              with: {
                clip: true,
                source: {
                  columns: { id: true, name: true, storageKey: true },
                },
              },
            });

            return { segments: items };
          }),
        ),
    ),

  getBySource: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;
            const results = yield* db.query.segments.findMany({
              where: eq(segments.sourceId, input.sourceId),
              orderBy: [asc(segments.startTime)],
              with: {
                clip: true,
                source: {
                  columns: { id: true, name: true, storageKey: true },
                },
              },
            });

            return { segments: results };
          }),
        ),
    ),

  // Queue a processing operation for segments
  queueProcessing: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()).min(1),
        operation: z.enum(["denoise", "transcribe"]),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            const segmentResults = yield* db.query.segments.findMany({
              where: inArray(segments.id, input.segmentIds),
              with: {
                speaker: true,
                clip: true,
                source: true,
              },
            });

            // Verify ownership
            const unauthorizedSegments = segmentResults.filter(
              (s) => s.speaker.userId !== ctx.session.user.id,
            );

            if (unauthorizedSegments.length > 0) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: "You do not have access to some segments",
                }),
              );
            }

            if (segmentResults.length !== input.segmentIds.length) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Some segments were not found",
                }),
              );
            }

            const jobName = {
              denoise: AudioJobs.Denoise,
              transcribe: AudioJobs.Transcribe,
            }[input.operation];

            const payloads: AudioJobPayload[] = segmentResults.map((seg) => ({
              entryId: seg.id,
            }));

            const results = yield* QueueService.enqueueJobBatch(
              Queues.AudioProcessing,
              jobName,
              payloads,
            );

            return {
              success: true,
              jobIds: results.map((r) => r.jobId),
              operation: input.operation,
              segmentCount: input.segmentIds.length,
            };
          }),
        ),
    ),

  // Create a new segment
  create: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        segment: z.object({
          speakerId: z.string().uuid(),
          startTime: z.number().min(0),
          endTime: z.number().min(0),
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

            if (input.segment.endTime <= input.segment.startTime) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "End time must be greater than start time",
                }),
              );
            }

            const speaker = yield* db.query.speakers.findFirst({
              where: eq(speakers.id, input.segment.speakerId),
            });

            if (!speaker) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Speaker not found",
                }),
              );
            }

            const [newSegment] = yield* db
              .insert(segments)
              .values({
                sourceId: input.sourceId,
                speakerId: input.segment.speakerId,
                startTime: input.segment.startTime,
                endTime: input.segment.endTime,
              })
              .returning();

            return {
              success: true,
              segment: newSegment,
            };
          }),
        ),
    ),

  // Update segments by explicit IDs
  updateMany: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()).min(1),
        patch: segmentPatchSchema.refine(hasPatchFields, {
          message: "Patch cannot be empty",
        }),
      }),
    )
    .mutation(
      async ({ ctx, input: { segmentIds, patch } }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            const updatedSegments = yield* db
              .update(segments)
              .set({
                ...(patch.startTime !== undefined && {
                  startTime: patch.startTime,
                }),
                ...(patch.endTime !== undefined && {
                  endTime: patch.endTime,
                }),
                ...(patch.speakerId !== undefined && {
                  speakerId: patch.speakerId,
                }),
                ...(patch.transcription !== undefined && {
                  transcription: patch.transcription,
                }),
                ...(patch.tags !== undefined && {
                  tags: patch.tags,
                }),
              })
              .where(inArray(segments.id, segmentIds))
              .returning({ id: segments.id });

            return { success: true, updatedCount: updatedSegments.length };
          }),
        ),
    ),

  // Split a segment at a specific time
  split: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        segmentId: z.string().uuid(),
        splitTime: z.number().min(0),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Verify source ownership
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

            const segment = yield* db.query.segments.findFirst({
              where: and(
                eq(segments.id, input.segmentId),
                eq(segments.sourceId, input.sourceId),
              ),
            });

            if (!segment) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Segment not found",
                }),
              );
            }

            if (
              input.splitTime <= segment.startTime ||
              input.splitTime >= segment.endTime
            ) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Split time must be within segment bounds",
                }),
              );
            }

            yield* db
              .update(segments)
              .set({ endTime: input.splitTime })
              .where(eq(segments.id, input.segmentId));

            const [secondSegment] = yield* db
              .insert(segments)
              .values({
                sourceId: input.sourceId,
                speakerId: segment.speakerId,
                startTime: input.splitTime,
                endTime: segment.endTime,
              })
              .returning();

            if (!secondSegment) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to create second segment",
                }),
              );
            }

            return {
              success: true,
              firstSegmentId: segment.id,
              secondSegmentId: secondSegment.id,
            };
          }),
        ),
    ),

  // Delete segments by explicit IDs
  deleteMany: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(
      async ({ ctx, input: { segmentIds } }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            const deletedSegments = yield* db
              .delete(segments)
              .where(inArray(segments.id, segmentIds))
              .returning({ id: segments.id });

            return { success: true, deletedCount: deletedSegments.length };
          }),
        ),
    ),
});

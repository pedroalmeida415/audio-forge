import { on } from "node:events";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { segments, sources, speakers } from "~/server/db/schema";
import { type ClipEvent, clipEvents } from "~/server/events/clip-events";
import { initClipEventsBridge } from "~/server/events/clip-events-bridge";
import { Database } from "~/services/infra/database";
import {
  type AudioJobPayload,
  AudioJobs,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";

export const segmentRouter = createTRPCRouter({
  // Get all segment IDs for a speaker (lightweight ID index for windowed fetching)
  getIdsBySpeaker: protectedProcedure
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

            // Verify speaker exists and belongs to user
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

            const aggResult = yield* db
              .select({
                ids: sql<string[]>`
                  array_agg(${segments.id} order by ${segments.startTime} asc)
                `,
              })
              .from(segments)
              .where(eq(segments.speakerId, input.speakerId));

            if (!aggResult[0])
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Speaker not found",
                }),
              );

            return aggResult[0].ids;
          }),
        ),
    ),

  getByIds: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()).max(100),
      }),
    )
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            if (input.segmentIds.length === 0) {
              return [];
            }

            // Fetch segments with relations
            return yield* db.query.segments.findMany({
              where: inArray(segments.id, input.segmentIds),
              with: {
                clip: true,
                source: {
                  columns: { id: true, name: true, storageKey: true },
                },
              },
            });
          }),
        ),
    ),

  // Update segment transcription
  updateTranscription: protectedProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        transcription: z.string().nullable(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            const segment = yield* db.query.segments.findFirst({
              where: eq(segments.id, input.segmentId),
              with: {
                speaker: true,
              },
            });

            if (!segment) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Segment not found",
                }),
              );
            }

            if (segment.speaker.userId !== ctx.session.user.id) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: "You do not have access to this segment",
                }),
              );
            }

            yield* db
              .update(segments)
              .set({ transcription: input.transcription })
              .where(eq(segments.id, input.segmentId));

            return { success: true };
          }),
        ),
    ),

  // Update segment tags
  updateTags: protectedProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        tags: z.array(z.string()),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            const segment = yield* db.query.segments.findFirst({
              where: eq(segments.id, input.segmentId),
              with: {
                speaker: true,
              },
            });

            if (!segment) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Segment not found",
                }),
              );
            }

            if (segment.speaker.userId !== ctx.session.user.id) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: "You do not have access to this segment",
                }),
              );
            }

            yield* db
              .update(segments)
              .set({ tags: input.tags.length > 0 ? input.tags : null })
              .where(eq(segments.id, input.segmentId));

            return { success: true };
          }),
        ),
    ),

  // Queue a processing operation for segments
  queueProcessing: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()).min(1),
        operation: z.enum(["denoise", "remove_overlap", "transcribe"]),
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
              remove_overlap: AudioJobs.RemoveOverlap,
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
  createSegment: protectedProcedure
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

  // Update one or many segments
  updateSegments: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        segmentIds: z.union([z.string().uuid(), z.array(z.string().uuid())]),
        updates: z.object({
          startTime: z.number().min(0).optional(),
          endTime: z.number().min(0).optional(),
          speakerId: z.string().uuid().optional(),
        }),
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

            const segmentIds = Array.isArray(input.segmentIds)
              ? input.segmentIds
              : [input.segmentIds];

            // Validate time constraints if times are being updated
            if (
              input.updates.startTime !== undefined &&
              input.updates.endTime !== undefined
            ) {
              if (input.updates.endTime <= input.updates.startTime) {
                return yield* Effect.fail(
                  new TRPCError({
                    code: "BAD_REQUEST",
                    message: "End time must be greater than start time",
                  }),
                );
              }
            }

            yield* db
              .update(segments)
              .set({
                ...(input.updates.startTime !== undefined && {
                  startTime: input.updates.startTime,
                }),
                ...(input.updates.endTime !== undefined && {
                  endTime: input.updates.endTime,
                }),
                ...(input.updates.speakerId !== undefined && {
                  speakerId: input.updates.speakerId,
                }),
              })
              .where(
                and(
                  inArray(segments.id, segmentIds),
                  eq(segments.sourceId, input.sourceId),
                ),
              );

            return { success: true, updatedCount: segmentIds.length };
          }),
        ),
    ),

  // Split a segment at a specific time
  splitSegment: protectedProcedure
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

  // Delete segments
  deleteSegments: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
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

            yield* db
              .delete(segments)
              .where(
                and(
                  inArray(segments.id, input.segmentIds),
                  eq(segments.sourceId, input.sourceId),
                ),
              );

            return { success: true, deletedCount: input.segmentIds.length };
          }),
        ),
    ),

  // Delete segments by speaker (for speaker page)
  deleteSegmentsBySpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
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

            const result = yield* db
              .delete(segments)
              .where(
                and(
                  inArray(segments.id, input.segmentIds),
                  eq(segments.speakerId, input.speakerId),
                ),
              )
              .returning({ id: segments.id });

            return { success: true, deletedCount: result.length };
          }),
        ),
    ),

  // Change speaker for segments
  changeSpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
        targetSpeakerId: z.string().uuid(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

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
                  message: "Current speaker not found",
                }),
              );
            }

            const targetSpeaker = yield* db.query.speakers.findFirst({
              where: and(
                eq(speakers.id, input.targetSpeakerId),
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

            const result = yield* db
              .update(segments)
              .set({ speakerId: input.targetSpeakerId })
              .where(
                and(
                  inArray(segments.id, input.segmentIds),
                  eq(segments.speakerId, input.speakerId),
                ),
              )
              .returning({ id: segments.id });

            return { success: true, updatedCount: result.length };
          }),
        ),
    ),

  // SSE subscription for clip completion events
  onClipCreated: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
    .subscription(async function* (opts) {
      const { speakerId } = opts.input;

      initClipEventsBridge();

      const eventName = `clip:speaker:${speakerId}`;

      for await (const [event] of on(clipEvents, eventName, {
        signal: opts.signal,
      })) {
        yield event as ClipEvent;
      }
    }),
});

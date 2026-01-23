import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clippingSessions,
  segments,
  speakers,
} from "~/server/db/schema";
import { Database } from "~/services/infra/database";
import {
  AudioJobs,
  type AudioJobPayload,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";

export const segmentRouter = createTRPCRouter({
  // Get paginated segments for a speaker with clips and session info
  getBySpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(), // Cursor-based pagination using segment ID
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

            // Get total count for this speaker
            const totalResult = yield* Effect.tryPromise({
              try: () =>
                db
                  .select({ total: count(segments.id) })
                  .from(segments)
                  .where(eq(segments.speakerId, input.speakerId)),
              catch: (error) =>
                new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to count segments",
                  cause: error,
                }),
            });

            const total = totalResult[0]?.total ?? 0;

            // Get segments with clips and session info
            const segmentResults = yield* db.query.segments.findMany({
              where: eq(segments.speakerId, input.speakerId),
              with: {
                clip: {
                  with: {
                    file: true,
                  },
                },
                session: {
                  with: {
                    file: true,
                  },
                },
              },
              orderBy: [asc(segments.startTime)],
              limit: input.limit + 1, // Get one extra to determine if there's more
              ...(input.cursor &&
                {
                  // For cursor pagination, we'd need to filter by startTime > cursor's startTime
                  // For simplicity, we'll use offset-based pagination via cursor index
                }),
            });

            const hasMore = segmentResults.length > input.limit;
            const items = hasMore
              ? segmentResults.slice(0, input.limit)
              : segmentResults;
            const nextCursor = hasMore
              ? items[items.length - 1]?.id
              : undefined;

            return {
              items,
              nextCursor,
              total,
            };
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

            // Get segment with speaker to verify ownership
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

            // Update transcription
            yield* db
              .update(segments)
              .set({ transcription: input.transcription })
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

            // Fetch segments with session/file info for building job payloads
            const segmentResults = yield* db.query.segments.findMany({
              where: inArray(segments.id, input.segmentIds),
              with: {
                speaker: true,
                clip: true,
                session: {
                  with: {
                    file: true,
                  },
                },
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

            // Map operation to job name
            const jobName = {
              denoise: AudioJobs.Denoise,
              remove_overlap: AudioJobs.RemoveOverlap,
              transcribe: AudioJobs.Transcribe,
            }[input.operation];

            // All clip operations use segmentId as entryId
            // Worker will ensure clip exists before processing
            const payloads: AudioJobPayload[] = segmentResults.map((seg) => ({
              entryId: seg.id,
            }));

            // Enqueue batch
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
        sessionId: z.string().uuid(),
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

            // Validate time constraints
            if (input.segment.endTime <= input.segment.startTime) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "End time must be greater than start time",
                }),
              );
            }

            // Validate speaker exists
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

            // Insert new segment
            const [newSegment] = yield* db
              .insert(segments)
              .values({
                sessionId: input.sessionId,
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

  // Update one or many segments (project segments only)
  // Local segments cannot be modified directly - use promoteLocalSegments for speaker changes
  updateSegments: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
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

            // Normalize to array
            const segmentIds = Array.isArray(input.segmentIds)
              ? input.segmentIds
              : [input.segmentIds];

            // Check if any segments are local (stored in diarization JSONB)
            const localSegmentIds = new Set(
              session.diarization?.segments?.map((s) => s.id) ?? [],
            );
            const localSegmentsInRequest = segmentIds.filter((id) =>
              localSegmentIds.has(id),
            );

            if (localSegmentsInRequest.length > 0) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "Local segments cannot be modified directly. Use promoteLocalSegments to change speaker.",
                }),
              );
            }

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

            // Update project segments in the table
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
                  eq(segments.sessionId, input.sessionId),
                ),
              );

            return { success: true, updatedCount: segmentIds.length };
          }),
        ),
    ),

  // Split a segment at a specific time (project segments only)
  // Local segments cannot be split
  splitSegment: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segmentId: z.string().uuid(),
        splitTime: z.number().min(0),
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

            // Check if segment is local (stored in diarization JSONB)
            const localSegmentIds = new Set(
              session.diarization?.segments?.map((s) => s.id) ?? [],
            );

            if (localSegmentIds.has(input.segmentId)) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Local segments cannot be split",
                }),
              );
            }

            // Get the project segment to split
            const segment = yield* db.query.segments.findFirst({
              where: and(
                eq(segments.id, input.segmentId),
                eq(segments.sessionId, input.sessionId),
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

            // Validate split time is within segment bounds
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

            // Update original segment (keep same ID, update end time)
            yield* db
              .update(segments)
              .set({ endTime: input.splitTime })
              .where(eq(segments.id, input.segmentId));

            // Create second segment (from split time to original end)
            const [secondSegment] = yield* db
              .insert(segments)
              .values({
                sessionId: input.sessionId,
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

  // Delete segments (project segments only)
  // Local segments cannot be deleted
  deleteSegments: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
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

            // Check if any segments are local (stored in diarization JSONB)
            const localSegmentIds = new Set(
              session.diarization?.segments?.map((s) => s.id) ?? [],
            );
            const localSegmentsInRequest = input.segmentIds.filter((id) =>
              localSegmentIds.has(id),
            );

            if (localSegmentsInRequest.length > 0) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Local segments cannot be deleted",
                }),
              );
            }

            // Delete project segments
            yield* db
              .delete(segments)
              .where(
                and(
                  inArray(segments.id, input.segmentIds),
                  eq(segments.sessionId, input.sessionId),
                ),
              );

            return { success: true, deletedCount: input.segmentIds.length };
          }),
        ),
    ),

  // Promote local segments to project level with a new speaker
  // This is used when changing a local segment's speaker to a project speaker
  promoteLocalSegments: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        localSegmentIds: z.array(z.string().uuid()).min(1),
        targetSpeakerId: z.string().uuid(), // Must be a project speaker
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

            // Validate target speaker exists in speakers table (project speaker)
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
                  message: "Target speaker not found or not a project speaker",
                }),
              );
            }

            // Find local segments in diarization JSONB
            const localSegmentsMap = new Map(
              (session.diarization?.segments ?? []).map((s) => [s.id, s]),
            );
            const localSegmentIdsSet = new Set(input.localSegmentIds);

            // Validate all requested segments exist in local segments
            const segmentsToPromote = input.localSegmentIds
              .map((id) => localSegmentsMap.get(id))
              .filter((s) => s !== undefined);

            if (segmentsToPromote.length !== input.localSegmentIds.length) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "BAD_REQUEST",
                  message: "One or more segments are not local segments",
                }),
              );
            }

            // Create new project segments in the segments table
            const newProjectSegments = yield* db
              .insert(segments)
              .values(
                segmentsToPromote.map((seg) => ({
                  sessionId: input.sessionId,
                  speakerId: input.targetSpeakerId,
                  startTime: seg.startTime,
                  endTime: seg.endTime,
                })),
              )
              .returning();

            // Remove promoted segments from JSONB
            const updatedSegments = (
              session.diarization?.segments ?? []
            ).filter((s) => !localSegmentIdsSet.has(s.id));

            // Update session with modified diarization
            yield* db
              .update(clippingSessions)
              .set({
                diarization: {
                  ...session.diarization!,
                  segments: updatedSegments,
                },
              })
              .where(eq(clippingSessions.id, input.sessionId));

            return {
              success: true,
              promotedCount: newProjectSegments.length,
              newSegments: newProjectSegments,
            };
          }),
        ),
    ),
});

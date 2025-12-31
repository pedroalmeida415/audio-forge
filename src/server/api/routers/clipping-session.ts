import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clips,
  clippingSessions,
  type DiarizationInfo,
  type FileSegment,
  files,
  type WorkspaceSpeaker,
} from "~/server/db/schema";
import {
  DiarizationService,
  QueueService,
  ServicesLive,
  StorageService,
} from "~/services";

// Schema for segment updates
const segmentUpdateSchema = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  speakerId: z.string().uuid().optional(),
  isDeleted: z.boolean().optional(),
  isReviewed: z.boolean().optional(),
});

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    StorageService | DiarizationService | QueueService
  >,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const clippingSessionRouter = createTRPCRouter({
  // Get session by ID with file data
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.id),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
          project: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      return session;
    }),

  // Start diarization for this session
  startDiarization: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        numSpeakers: z.number().int().min(1).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get the session with file
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      if (!session.file?.storageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File has no audio data",
        });
      }

      // 2. Generate presigned download URL for Pyannote
      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: session.file.storageKey!,
            expiresIn: 7200, // 2 hours for processing
          }),
        ),
      );

      // 3. Submit diarization job
      const webhookUrl = `${env.PYANNOTE_WEBHOOK_URL}/api/webhooks/diarization`;
      const jobResult = await runEffect(
        Effect.flatMap(DiarizationService, (diarization) =>
          diarization.submitJob({
            audioUrl,
            webhookUrl,
            numSpeakers: input.numSpeakers,
            confidence: true,
          }),
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

      await ctx.db
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

  // Get diarization status (polls Pyannote if still processing)
  getDiarizationStatus: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      if (!session.diarization) {
        return { status: null };
      }

      // If not completed, fetch latest status from Pyannote
      if (
        session.diarization.status === "pending" ||
        session.diarization.status === "running"
      ) {
        const statusResult = await runEffect(
          Effect.flatMap(DiarizationService, (service) =>
            service.getJobStatus(session.diarization!.jobId),
          ),
        );

        return {
          ...session.diarization,
          liveStatus: statusResult.status,
        };
      }

      return session.diarization;
    }),

  // Update one or many segments
  updateSegments: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segmentIds: z.union([z.string().uuid(), z.array(z.string().uuid())]),
        updates: segmentUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const currentSegments = session.segments ?? [];
      if (currentSegments.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No segments found",
        });
      }

      // Normalize to array
      const segmentIds = Array.isArray(input.segmentIds)
        ? input.segmentIds
        : [input.segmentIds];

      const segmentIdSet = new Set(segmentIds);
      const now = new Date().toISOString();

      // Apply updates to matching segments
      const updatedSegments = currentSegments.map((segment) => {
        if (!segmentIdSet.has(segment.id)) {
          return segment;
        }

        const updated: FileSegment = {
          ...segment,
          ...input.updates,
          updatedAt: now,
        };

        // Validate time constraints if times are being updated
        if (
          input.updates.start !== undefined ||
          input.updates.end !== undefined
        ) {
          if (updated.end <= updated.start) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `End time must be greater than start time for segment ${segment.id}`,
            });
          }
        }

        return updated;
      });

      await ctx.db
        .update(clippingSessions)
        .set({ segments: updatedSegments })
        .where(eq(clippingSessions.id, input.sessionId));

      return { success: true, updatedCount: segmentIds.length };
    }),

  // Create a new segment
  createSegment: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segment: z.object({
          speakerId: z.string().uuid(),
          start: z.number().min(0),
          end: z.number().min(0),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      // Validate time constraints
      if (input.segment.end <= input.segment.start) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be greater than start time",
        });
      }

      // Validate speaker exists
      const speakers = session.speakers ?? [];
      if (!speakers.some((s) => s.id === input.segment.speakerId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Speaker not found",
        });
      }

      const now = new Date().toISOString();
      const newSegment: FileSegment = {
        id: randomUUID(),
        speakerId: input.segment.speakerId,
        start: input.segment.start,
        end: input.segment.end,
        source: "manual",
        isDeleted: false,
        isReviewed: true,
        createdAt: now,
        updatedAt: now,
      };

      const currentSegments = session.segments ?? [];
      const updatedSegments = [...currentSegments, newSegment];

      // Sort by start time for consistency
      updatedSegments.sort((a, b) => a.start - b.start);

      await ctx.db
        .update(clippingSessions)
        .set({ segments: updatedSegments })
        .where(eq(clippingSessions.id, input.sessionId));

      return {
        success: true,
        segmentId: newSegment.id,
      };
    }),

  // Split a segment at a specific time
  splitSegment: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segmentId: z.string().uuid(),
        splitTime: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const currentSegments = session.segments ?? [];
      const segmentIndex = currentSegments.findIndex(
        (s) => s.id === input.segmentId,
      );

      if (segmentIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      const originalSegment = currentSegments[segmentIndex];
      if (!originalSegment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      // Validate split time is within segment bounds
      if (
        input.splitTime <= originalSegment.start ||
        input.splitTime >= originalSegment.end
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Split time must be within segment bounds",
        });
      }

      const now = new Date().toISOString();

      // Create first segment (original ID, updated end time)
      const firstSegment: FileSegment = {
        id: originalSegment.id,
        speakerId: originalSegment.speakerId,
        start: originalSegment.start,
        end: input.splitTime,
        confidence: originalSegment.confidence,
        source: originalSegment.source,
        isDeleted: originalSegment.isDeleted,
        isReviewed: originalSegment.isReviewed,
        createdAt: originalSegment.createdAt,
        updatedAt: now,
      };

      // Create second segment (new ID, from split time to original end)
      const secondSegment: FileSegment = {
        id: randomUUID(),
        speakerId: originalSegment.speakerId,
        start: input.splitTime,
        end: originalSegment.end,
        confidence: originalSegment.confidence,
        source: originalSegment.source,
        isDeleted: originalSegment.isDeleted,
        isReviewed: false,
        createdAt: now,
        updatedAt: now,
      };

      // Replace original segment with the two new ones
      const updatedSegments = [
        ...currentSegments.slice(0, segmentIndex),
        firstSegment,
        secondSegment,
        ...currentSegments.slice(segmentIndex + 1),
      ];

      await ctx.db
        .update(clippingSessions)
        .set({ segments: updatedSegments })
        .where(eq(clippingSessions.id, input.sessionId));

      return {
        success: true,
        firstSegmentId: firstSegment.id,
        secondSegmentId: secondSegment.id,
      };
    }),

  // Create a new speaker
  createSpeaker: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        label: z.string().min(1).max(100),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const newSpeaker: WorkspaceSpeaker = {
        id: randomUUID(),
        label: input.label,
        color: input.color,
        createdAt: new Date().toISOString(),
      };

      const currentSpeakers = session.speakers ?? [];
      const updatedSpeakers = [...currentSpeakers, newSpeaker];

      await ctx.db
        .update(clippingSessions)
        .set({ speakers: updatedSpeakers })
        .where(eq(clippingSessions.id, input.sessionId));

      return {
        success: true,
        speaker: newSpeaker,
      };
    }),

  // Update a speaker
  updateSpeaker: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        speakerId: z.string().uuid(),
        label: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const currentSpeakers = session.speakers ?? [];
      const speakerIndex = currentSpeakers.findIndex(
        (s) => s.id === input.speakerId,
      );

      if (speakerIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      const existingSpeaker = currentSpeakers[speakerIndex];
      if (!existingSpeaker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      const updatedSpeaker: WorkspaceSpeaker = {
        id: existingSpeaker.id,
        label: input.label ?? existingSpeaker.label,
        color: input.color !== undefined ? input.color : existingSpeaker.color,
        createdAt: existingSpeaker.createdAt,
      };

      const updatedSpeakers = [...currentSpeakers];
      updatedSpeakers[speakerIndex] = updatedSpeaker;

      await ctx.db
        .update(clippingSessions)
        .set({ speakers: updatedSpeakers })
        .where(eq(clippingSessions.id, input.sessionId));

      return { success: true };
    }),

  // Delete a speaker (and optionally reassign or delete segments)
  deleteSpeaker: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        speakerId: z.string().uuid(),
        reassignTo: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const currentSpeakers = session.speakers ?? [];
      const speakerIndex = currentSpeakers.findIndex(
        (s) => s.id === input.speakerId,
      );

      if (speakerIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      // Validate reassign target if provided
      if (
        input.reassignTo &&
        !currentSpeakers.some((s) => s.id === input.reassignTo)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reassign target speaker not found",
        });
      }

      // Update speakers list
      const updatedSpeakers = currentSpeakers.filter(
        (s) => s.id !== input.speakerId,
      );

      // Update segments
      const currentSegments = session.segments ?? [];
      const now = new Date().toISOString();
      let updatedSegments: FileSegment[];

      if (input.reassignTo) {
        // Reassign segments to another speaker
        updatedSegments = currentSegments.map((segment) =>
          segment.speakerId === input.speakerId
            ? { ...segment, speakerId: input.reassignTo!, updatedAt: now }
            : segment,
        );
      } else {
        // Mark segments as deleted
        updatedSegments = currentSegments.map((segment) =>
          segment.speakerId === input.speakerId
            ? { ...segment, isDeleted: true, updatedAt: now }
            : segment,
        );
      }

      await ctx.db
        .update(clippingSessions)
        .set({
          speakers: updatedSpeakers,
          segments: updatedSegments,
        })
        .where(eq(clippingSessions.id, input.sessionId));

      return { success: true };
    }),

  // Export segments to a collection (creates clips and enqueues for processing)
  exportToCollection: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        collectionId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch session with file info
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      const sourceStorageKey = session.file?.storageKey;
      if (!sourceStorageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source audio file not found",
        });
      }

      // 2. Get the speakers map for denormalized labels
      const speakersMap = new Map(
        (session.speakers ?? []).map((s) => [s.id, s.label]),
      );

      // 3. Filter segments from the session
      const allSegments = session.segments ?? [];
      const segmentIdSet = new Set(input.segmentIds);
      const selectedSegments = allSegments.filter(
        (s) => segmentIdSet.has(s.id) && !s.isDeleted,
      );

      if (selectedSegments.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid segments selected",
        });
      }

      // 4. Create clip records for each segment (status: pending)
      const clipRecords = await ctx.db
        .insert(clips)
        .values(
          selectedSegments.map((segment) => ({
            userId: ctx.session.user.id,
            collectionId: input.collectionId,
            sourceFileId: session.fileId,
            clippingSessionId: session.id,
            sourceSegmentId: segment.id,
            startTime: segment.start,
            endTime: segment.end,
            duration: segment.end - segment.start,
            speakerLabel: speakersMap.get(segment.speakerId) ?? null,
            status: "pending" as const,
          })),
        )
        .returning();

      // 5. Enqueue each clip to BullMQ
      const enqueueResults = await Promise.all(
        clipRecords.map((clip) =>
          runEffect(
            Effect.flatMap(QueueService, (queue) =>
              queue.enqueueClipGeneration({
                clipId: clip.id,
                sourceStorageKey,
                startTime: clip.startTime,
                endTime: clip.endTime,
              }),
            ),
          ),
        ),
      );

      return {
        clipIds: clipRecords.map((c) => c.id),
        totalClips: clipRecords.length,
        queuePosition: enqueueResults[0]?.position ?? 0,
      };
    }),
});

import { on } from "node:events";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { env } from "~/env";
import { generateSpeakerColor } from "~/lib/speaker-colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clippingSessions,
  type DiarizationInfo,
  type SegmentWithSource,
  type SpeakerWithSource,
  segments,
  speakers,
} from "~/server/db/schema";
import {
  type DiarizationEvent,
  diarizationEvents,
} from "~/server/events/diarization-events";
import { DiarizationService, ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, StorageService | DiarizationService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const clippingSessionRouter = createTRPCRouter({
  // Get session by ID with file, segments, and speakers
  // Returns unified segments and speakers with source discrimination
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
          segments: {
            orderBy: (seg, { asc }) => [asc(seg.startTime)],
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      // Get all project speakers (shown regardless of whether they have segments)
      const projectSpeakersRaw = await ctx.db.query.speakers.findMany({
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
      const localSpeakers: SpeakerWithSource[] = localSpeakersRaw.map((s) => ({
        id: s.id,
        projectId: session.projectId,
        userId: session.userId,
        name: s.label,
        color: s.color,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.createdAt),
        source: "local" as const,
      }));

      // Convert local segments to SegmentWithSource format
      const localSegments: SegmentWithSource[] = localSegmentsRaw.map((s) => ({
        id: s.id,
        sessionId: session.id,
        speakerId: s.speakerId,
        startTime: s.startTime,
        endTime: s.endTime,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.createdAt),
        source: "local" as const,
      }));

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

  // List sessions for a project
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clippingSessions.findMany({
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

  // Rename session
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.id),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      await ctx.db
        .update(clippingSessions)
        .set({ name: input.name })
        .where(eq(clippingSessions.id, input.id));

      return { success: true };
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
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
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
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Local segments cannot be modified directly. Use promoteLocalSegments to change speaker.",
        });
      }

      // Validate time constraints if times are being updated
      if (
        input.updates.startTime !== undefined &&
        input.updates.endTime !== undefined
      ) {
        if (input.updates.endTime <= input.updates.startTime) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End time must be greater than start time",
          });
        }
      }

      // Update project segments in the table
      await ctx.db
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
      if (input.segment.endTime <= input.segment.startTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be greater than start time",
        });
      }

      // Validate speaker exists
      const speaker = await ctx.db.query.speakers.findFirst({
        where: eq(speakers.id, input.segment.speakerId),
      });

      if (!speaker) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Speaker not found",
        });
      }

      // Insert new segment
      const [newSegment] = await ctx.db
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
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
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

      // Check if segment is local (stored in diarization JSONB)
      const localSegmentIds = new Set(
        session.diarization?.segments?.map((s) => s.id) ?? [],
      );

      if (localSegmentIds.has(input.segmentId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Local segments cannot be split",
        });
      }

      // Get the project segment to split
      const segment = await ctx.db.query.segments.findFirst({
        where: and(
          eq(segments.id, input.segmentId),
          eq(segments.sessionId, input.sessionId),
        ),
      });

      if (!segment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      // Validate split time is within segment bounds
      if (
        input.splitTime <= segment.startTime ||
        input.splitTime >= segment.endTime
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Split time must be within segment bounds",
        });
      }

      // Update original segment (keep same ID, update end time)
      await ctx.db
        .update(segments)
        .set({ endTime: input.splitTime })
        .where(eq(segments.id, input.segmentId));

      // Create second segment (from split time to original end)
      const [secondSegment] = await ctx.db
        .insert(segments)
        .values({
          sessionId: input.sessionId,
          speakerId: segment.speakerId,
          startTime: input.splitTime,
          endTime: segment.endTime,
        })
        .returning();

      if (!secondSegment) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create second segment",
        });
      }

      return {
        success: true,
        firstSegmentId: segment.id,
        secondSegmentId: secondSegment.id,
      };
    }),

  // Delete segments (project segments only)
  // Local segments cannot be deleted
  deleteSegments: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
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

      // Check if any segments are local (stored in diarization JSONB)
      const localSegmentIds = new Set(
        session.diarization?.segments?.map((s) => s.id) ?? [],
      );
      const localSegmentsInRequest = input.segmentIds.filter((id) =>
        localSegmentIds.has(id),
      );

      if (localSegmentsInRequest.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Local segments cannot be deleted",
        });
      }

      // Delete project segments
      await ctx.db
        .delete(segments)
        .where(
          and(
            inArray(segments.id, input.segmentIds),
            eq(segments.sessionId, input.sessionId),
          ),
        );

      return { success: true, deletedCount: input.segmentIds.length };
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
    .mutation(async ({ ctx, input }) => {
      // Insert speaker at project level
      const [newSpeaker] = await ctx.db
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

  // Update a project speaker (name and/or color)
  updateSpeaker: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get speaker to verify ownership
      const speaker = await ctx.db.query.speakers.findFirst({
        where: and(
          eq(speakers.id, input.speakerId),
          eq(speakers.userId, ctx.session.user.id),
        ),
      });

      if (!speaker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      await ctx.db
        .update(speakers)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.color !== undefined && { color: input.color }),
        })
        .where(eq(speakers.id, input.speakerId));

      return { success: true };
    }),

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

      if (!session.diarization?.speakers) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No local speakers in this session",
        });
      }

      // Find and update the local speaker
      const speakerIndex = session.diarization.speakers.findIndex(
        (s) => s.id === input.speakerId,
      );

      if (speakerIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Local speaker not found",
        });
      }

      // Create updated speakers array
      const updatedSpeakers = [...session.diarization.speakers];
      updatedSpeakers[speakerIndex] = {
        ...updatedSpeakers[speakerIndex]!,
        ...(input.name !== undefined && { label: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      };

      // Update session with modified diarization
      await ctx.db
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
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
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

      // Check if speaker is local (stored in diarization JSONB)
      const localSpeakerIds = new Set(
        session.diarization?.speakers?.map((s) => s.id) ?? [],
      );

      if (!localSpeakerIds.has(input.speakerId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Project speakers cannot be deleted from inside the clipping session",
        });
      }

      // Remove speaker and their segments from JSONB
      const updatedSpeakers = (session.diarization?.speakers ?? []).filter(
        (s) => s.id !== input.speakerId,
      );
      const updatedSegments = (session.diarization?.segments ?? []).filter(
        (s) => s.speakerId !== input.speakerId,
      );

      // Update session with modified diarization
      await ctx.db
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
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
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

      // Validate target speaker exists in speakers table (project speaker)
      const targetSpeaker = await ctx.db.query.speakers.findFirst({
        where: and(
          eq(speakers.id, input.targetSpeakerId),
          eq(speakers.userId, ctx.session.user.id),
        ),
      });

      if (!targetSpeaker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target speaker not found or not a project speaker",
        });
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
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more segments are not local segments",
        });
      }

      // Create new project segments in the segments table
      const newProjectSegments = await ctx.db
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
      const updatedSegments = (session.diarization?.segments ?? []).filter(
        (s) => !localSegmentIdsSet.has(s.id),
      );

      // Update session with modified diarization
      await ctx.db
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

  // Get all speakers for a project (for speaker picker)
  getProjectSpeakers: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        includeDiarization: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      const allSpeakers = await ctx.db.query.speakers.findMany({
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

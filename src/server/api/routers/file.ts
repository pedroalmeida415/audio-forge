import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clips,
  type FileSegment,
  files,
  type WorkspaceSpeaker,
} from "~/server/db/schema";
import { QueueService, ServicesLive, StorageService } from "~/services";

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
  effect: Effect.Effect<A, E, StorageService | QueueService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const fileRouter = createTRPCRouter({
  // Get presigned URL for uploading audio to R2
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        contentType: z.string().regex(/^audio\//),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedUploadUrl({
            fileName: input.fileName,
            contentType: input.contentType,
            userId: ctx.session.user.id,
          }),
        ),
      );

      return result;
    }),

  // Create file record after upload
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        name: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Extract filename from storage key if not provided
      const fileName =
        input.name ?? input.storageKey.split("/").pop() ?? "Untitled";

      const [file] = await ctx.db
        .insert(files)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          storageKey: input.storageKey,
          name: fileName,
          speakers: [],
          segments: [],
        })
        .returning();

      if (!file) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create file record",
        });
      }

      return file;
    }),

  // Get file by ID with optional diarization
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.userId, ctx.session.user.id),
        ),
        with: {
          project: true,
          diarizations: {
            orderBy: (diarizations, { desc }) => [desc(diarizations.createdAt)],
            limit: 1,
          },
        },
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      return {
        ...file,
        latestDiarization: file.diarizations[0] ?? null,
      };
    }),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      if (!file.storageKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audio file not found in storage",
        });
      }

      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: file.storageKey!,
            expiresIn: 3600, // 1 hour
          }),
        ),
      );

      return audioUrl;
    }),

  // List files for a project
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.files.findMany({
        where: and(
          eq(files.projectId, input.projectId),
          eq(files.userId, ctx.session.user.id),
        ),
        orderBy: [desc(files.createdAt)],
        columns: {
          id: true,
          name: true,
          storageKey: true,
          createdAt: true,
        },
      });
    }),

  // Rename file
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      await ctx.db
        .update(files)
        .set({ name: input.name })
        .where(eq(files.id, input.id));

      return { success: true };
    }),

  // Update one or many segments
  updateSegments: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        segmentIds: z.union([z.string().uuid(), z.array(z.string().uuid())]),
        updates: segmentUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const currentSegments = file.segments ?? [];
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
        .update(files)
        .set({ segments: updatedSegments })
        .where(eq(files.id, input.fileId));

      return { success: true, updatedCount: segmentIds.length };
    }),

  // Create a new segment
  createSegment: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        segment: z.object({
          speakerId: z.string().uuid(),
          start: z.number().min(0),
          end: z.number().min(0),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
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
      const speakers = file.speakers ?? [];
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

      const currentSegments = file.segments ?? [];
      const updatedSegments = [...currentSegments, newSegment];

      // Sort by start time for consistency
      updatedSegments.sort((a, b) => a.start - b.start);

      await ctx.db
        .update(files)
        .set({ segments: updatedSegments })
        .where(eq(files.id, input.fileId));

      return {
        success: true,
        segmentId: newSegment.id,
      };
    }),

  // Split a segment at a specific time
  splitSegment: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        segmentId: z.string().uuid(),
        splitTime: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const currentSegments = file.segments ?? [];
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
        ...originalSegment,
        end: input.splitTime,
        updatedAt: now,
      };

      // Create second segment (new ID, from split time to original end)
      const secondSegment: FileSegment = {
        ...originalSegment,
        id: randomUUID(),
        start: input.splitTime,
        end: originalSegment.end,
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
        .update(files)
        .set({ segments: updatedSegments })
        .where(eq(files.id, input.fileId));

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
        fileId: z.string().uuid(),
        label: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const newSpeaker: WorkspaceSpeaker = {
        id: randomUUID(),
        label: input.label,
        createdAt: new Date().toISOString(),
      };

      const currentSpeakers = file.speakers ?? [];
      const updatedSpeakers = [...currentSpeakers, newSpeaker];

      await ctx.db
        .update(files)
        .set({ speakers: updatedSpeakers })
        .where(eq(files.id, input.fileId));

      return {
        success: true,
        speaker: newSpeaker,
      };
    }),

  // Update a speaker
  updateSpeaker: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        speakerId: z.string().uuid(),
        label: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const currentSpeakers = file.speakers ?? [];
      const speakerIndex = currentSpeakers.findIndex(
        (s) => s.id === input.speakerId,
      );

      if (speakerIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      const updatedSpeakers = [...currentSpeakers];
      updatedSpeakers[speakerIndex] = {
        ...updatedSpeakers[speakerIndex],
        ...(input.label && { label: input.label }),
        ...(input.color !== undefined && { color: input.color }),
      };

      await ctx.db
        .update(files)
        .set({ speakers: updatedSpeakers })
        .where(eq(files.id, input.fileId));

      return { success: true };
    }),

  // Delete a speaker (and optionally reassign or delete segments)
  deleteSpeaker: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        speakerId: z.string().uuid(),
        reassignTo: z.string().uuid().optional(), // If provided, reassign segments
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const currentSpeakers = file.speakers ?? [];
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
      const currentSegments = file.segments ?? [];
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
        .update(files)
        .set({
          speakers: updatedSpeakers,
          segments: updatedSegments,
        })
        .where(eq(files.id, input.fileId));

      return { success: true };
    }),

  // Delete a file
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      // Delete from storage if file exists
      if (file.storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: file.storageKey! }),
          ),
        ).catch(() => {
          // Log but don't fail if storage deletion fails
          console.error("Failed to delete file from storage");
        });
      }

      // Delete file (cascade will handle related records)
      await ctx.db.delete(files).where(eq(files.id, input.id));

      return { success: true };
    }),

  // Export segments to a collection (creates clips and enqueues for processing)
  exportToCollection: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        collectionId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch file with storage info
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const sourceStorageKey = file.storageKey;
      if (!sourceStorageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source audio file not found",
        });
      }

      // 2. Get the speakers map for denormalized labels
      const speakersMap = new Map(
        (file.speakers ?? []).map((s) => [s.id, s.label]),
      );

      // 3. Filter segments from the file
      const allSegments = file.segments ?? [];
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
            sourceFileId: input.fileId,
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

import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type DiarizationSegment,
  diarizations,
  files,
} from "~/server/db/schema";
import { DiarizationService, ServicesLive, StorageService } from "~/services";

// Schema for segment updates
const segmentUpdateSchema = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  speaker: z.string().min(1).optional(),
  isDeleted: z.boolean().optional(),
  isReviewed: z.boolean().optional(),
});

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, StorageService | DiarizationService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const diarizationRouter = createTRPCRouter({
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

  // Create file record and start diarization job
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        numSpeakers: z.number().int().min(1).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Create file record
      const [file] = await ctx.db
        .insert(files)
        .values({
          userId: ctx.session.user.id,
          storageKey: input.storageKey,
        })
        .returning();

      if (!file) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create file record",
        });
      }

      // 2. Generate presigned download URL for Pyannote
      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: input.storageKey,
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

      // 4. Create diarization record
      const [diarization] = await ctx.db
        .insert(diarizations)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          fileId: file.id,
          diarizationJobId: jobResult.jobId,
          startedAt: new Date(),
        })
        .returning();

      if (!diarization) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create diarization record",
        });
      }

      return {
        id: diarization.id,
        jobId: jobResult.jobId,
        status: jobResult.status,
        warning: jobResult.warning,
      };
    }),

  // Get status of a specific diarization
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
          project: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      // If not completed, fetch latest status from Pyannote
      if (!diarization.completedAt && diarization.diarizationJobId) {
        const statusResult = await runEffect(
          Effect.flatMap(DiarizationService, (service) =>
            service.getJobStatus(diarization.diarizationJobId!),
          ),
        );

        return {
          ...diarization,
          liveStatus: statusResult.status,
        };
      }

      return diarization;
    }),

  // List all diarizations for the user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.diarizations.findMany({
      where: eq(diarizations.userId, ctx.session.user.id),
      orderBy: [desc(diarizations.createdAt)],
      with: {
        file: true,
      },
    });
  }),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      const storageKey = diarization.file?.storageKey;
      if (!storageKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audio file not found",
        });
      }

      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: storageKey,
            expiresIn: 3600, // 1 hour
          }),
        ),
      );

      return audioUrl;
    }),

  // Delete a diarization
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      // Delete from storage if file exists
      if (diarization.file?.storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: diarization.file!.storageKey! }),
          ),
        ).catch(() => {
          // Log but don't fail if storage deletion fails
          console.error("Failed to delete file from storage");
        });
      }

      // Delete diarization (cascade will delete file)
      await ctx.db.delete(diarizations).where(eq(diarizations.id, input.id));

      return { success: true };
    }),

  // Set speaker-to-collection mapping
  setSpeakerCollection: protectedProcedure
    .input(
      z.object({
        diarizationId: z.string().uuid(),
        speaker: z.string().min(1),
        collectionId: z.string().uuid(),
        collectionName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.diarizationId),
          eq(diarizations.userId, ctx.session.user.id),
        ),
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      const currentMappings = diarization.speakerCollections ?? {};
      const updatedMappings = {
        ...currentMappings,
        [input.speaker]: {
          collectionId: input.collectionId,
          collectionName: input.collectionName,
        },
      };

      await ctx.db
        .update(diarizations)
        .set({ speakerCollections: updatedMappings })
        .where(eq(diarizations.id, input.diarizationId));

      return { success: true };
    }),

  // Update one or many segments
  updateSegments: protectedProcedure
    .input(
      z.object({
        diarizationId: z.string().uuid(),
        segmentIds: z.union([z.string().uuid(), z.array(z.string().uuid())]),
        updates: segmentUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.diarizationId),
          eq(diarizations.userId, ctx.session.user.id),
        ),
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      if (!diarization.output?.segments) {
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

      // Apply updates to matching segments
      const updatedSegments = diarization.output.segments.map((segment) => {
        if (!segmentIdSet.has(segment.id)) {
          return segment;
        }

        const updated = { ...segment, ...input.updates };

        // Validate time constraints if times are being updated
        if (
          input.updates.start !== undefined ||
          input.updates.end !== undefined
        ) {
          const newStart = updated.start;
          const newEnd = updated.end;
          if (newEnd <= newStart) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `End time must be greater than start time for segment ${segment.id}`,
            });
          }
        }

        return updated;
      });

      await ctx.db
        .update(diarizations)
        .set({ output: { segments: updatedSegments } })
        .where(eq(diarizations.id, input.diarizationId));

      return { success: true, updatedCount: segmentIds.length };
    }),

  // Split a segment at a specific time
  splitSegment: protectedProcedure
    .input(
      z.object({
        diarizationId: z.string().uuid(),
        segmentId: z.string().uuid(),
        splitTime: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.diarizationId),
          eq(diarizations.userId, ctx.session.user.id),
        ),
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      if (!diarization.output?.segments) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No segments found",
        });
      }

      // Find the segment to split
      const segmentIndex = diarization.output.segments.findIndex(
        (s) => s.id === input.segmentId,
      );

      if (segmentIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      const originalSegment = diarization.output.segments[segmentIndex];

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

      // Create first segment (original ID, updated end time)
      const firstSegment: DiarizationSegment = {
        ...originalSegment,
        end: input.splitTime,
      };

      // Create second segment (new ID, from split time to original end)
      const secondSegment: DiarizationSegment = {
        ...originalSegment,
        id: randomUUID(),
        start: input.splitTime,
        end: originalSegment.end,
        isReviewed: false, // New segment needs review
      };

      // Replace original segment with the two new ones
      const updatedSegments = [
        ...diarization.output.segments.slice(0, segmentIndex),
        firstSegment,
        secondSegment,
        ...diarization.output.segments.slice(segmentIndex + 1),
      ];

      await ctx.db
        .update(diarizations)
        .set({ output: { segments: updatedSegments } })
        .where(eq(diarizations.id, input.diarizationId));

      return {
        success: true,
        firstSegmentId: firstSegment.id,
        secondSegmentId: secondSegment.id,
      };
    }),

  // Create a new segment (for click-and-drag segment creation)
  createSegment: protectedProcedure
    .input(
      z.object({
        diarizationId: z.string().uuid(),
        segment: z.object({
          speaker: z.string().min(1),
          start: z.number().min(0),
          end: z.number().min(0),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.diarizationId),
          eq(diarizations.userId, ctx.session.user.id),
        ),
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      // Validate time constraints
      if (input.segment.end <= input.segment.start) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be greater than start time",
        });
      }

      // Create new segment with UUID
      const newSegment: DiarizationSegment = {
        id: randomUUID(),
        speaker: input.segment.speaker,
        start: input.segment.start,
        end: input.segment.end,
        confidence: undefined,
        isDeleted: false,
        isReviewed: true, // User-created segments are marked as reviewed
      };

      const currentSegments = diarization.output?.segments ?? [];
      const updatedSegments = [...currentSegments, newSegment];

      // Sort by start time for consistency
      updatedSegments.sort((a, b) => a.start - b.start);

      await ctx.db
        .update(diarizations)
        .set({ output: { segments: updatedSegments } })
        .where(eq(diarizations.id, input.diarizationId));

      return {
        success: true,
        segmentId: newSegment.id,
      };
    }),
});

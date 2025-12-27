import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clips, clippingSessions } from "~/server/db/schema";
import { QueueService, ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, QueueService | StorageService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const clipsRouter = createTRPCRouter({
  // List clips by collection
  listByCollection: protectedProcedure
    .input(z.object({ collectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clips.findMany({
        where: and(
          eq(clips.collectionId, input.collectionId),
          eq(clips.userId, ctx.session.user.id),
        ),
        orderBy: (clips, { desc }) => [desc(clips.createdAt)],
      });
    }),

  // List clips by clipping session
  listBySession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clips.findMany({
        where: and(
          eq(clips.clippingSessionId, input.sessionId),
          eq(clips.userId, ctx.session.user.id),
        ),
        orderBy: (clips, { desc }) => [desc(clips.createdAt)],
      });
    }),

  // Create clips from selected segments (virtual - no file generation)
  createClips: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        collectionId: z.string().uuid(),
        segmentIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch clipping session
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: and(
          eq(clippingSessions.id, input.sessionId),
          eq(clippingSessions.userId, ctx.session.user.id),
        ),
        with: { file: true },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clipping session not found",
        });
      }

      // 2. Filter segments from the session
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

      // 3. Create clip records with status: virtual (no file generation)
      const clipRecords = await ctx.db
        .insert(clips)
        .values(
          selectedSegments.map((segment) => ({
            userId: ctx.session.user.id,
            collectionId: input.collectionId,
            clippingSessionId: input.sessionId,
            sourceFileId: session.fileId,
            sourceSegmentId: segment.id,
            startTime: segment.start,
            endTime: segment.end,
            duration: segment.end - segment.start,
            speakerLabel: segment.speaker,
            status: "virtual" as const,
          })),
        )
        .returning();

      return {
        clipIds: clipRecords.map((c) => c.id),
        totalClips: clipRecords.length,
      };
    }),

  // Get clip status
  getClipStatus: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.clipId),
          eq(clips.userId, ctx.session.user.id),
        ),
      });

      if (!clip) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clip not found",
        });
      }

      // Get queue position if pending (exporting)
      let queuePosition: number | null = null;
      if (clip.status === "pending") {
        queuePosition = await runEffect(
          Effect.flatMap(QueueService, (queue) =>
            queue.getClipPosition(input.clipId),
          ),
        );
      }

      return {
        ...clip,
        queuePosition,
      };
    }),

  // Get playback info for a clip (direct URL or proxy params)
  getClipPlaybackInfo: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.clipId),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
          clippingSession: true,
        },
      });

      if (!clip) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clip not found",
        });
      }

      // If clip has a generated file (status: completed), return direct URL
      const fileStorageKey = clip.file?.storageKey;
      if (clip.status === "completed" && fileStorageKey) {
        const url = await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.generatePresignedDownloadUrl({
              key: fileStorageKey,
              expiresIn: 3600,
            }),
          ),
        );

        return {
          type: "direct" as const,
          url,
          clipId: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.duration,
        };
      }

      // Otherwise, return proxy params for on-the-fly streaming
      return {
        type: "proxy" as const,
        sessionId: clip.clippingSessionId,
        clipId: clip.id,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
      };
    }),

  // Legacy getClipUrl - returns URL for completed clips, throws for virtual
  getClipUrl: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.clipId),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: { file: true },
      });

      if (!clip) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clip not found",
        });
      }

      const storageKey = clip.file?.storageKey;
      if (!storageKey) {
        // For virtual clips, suggest using getClipPlaybackInfo instead
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Clip file not found. Use getClipPlaybackInfo for virtual clips.",
        });
      }

      const url = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: storageKey,
            expiresIn: 3600,
          }),
        ),
      );

      return url;
    }),

  // Export clips - generate actual files for selected clips
  exportClips: protectedProcedure
    .input(
      z.object({
        clipIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get clips that need exporting
      const clipsToExport = await ctx.db.query.clips.findMany({
        where: and(
          inArray(clips.id, input.clipIds),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: { clippingSession: { with: { file: true } } },
      });

      if (clipsToExport.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No clips found",
        });
      }

      // Filter to only virtual or failed clips (already completed clips don't need export)
      const eligibleClips = clipsToExport.filter(
        (c) => c.status === "virtual" || c.status === "failed",
      );

      if (eligibleClips.length === 0) {
        return {
          exportedCount: 0,
          message: "All clips already exported",
        };
      }

      // 2. Update status to pending
      await ctx.db
        .update(clips)
        .set({
          status: "pending",
          errorMessage: null,
        })
        .where(
          inArray(
            clips.id,
            eligibleClips.map((c) => c.id),
          ),
        );

      // 3. Enqueue each clip for generation
      const enqueueResults = await Promise.all(
        eligibleClips.map((clip) => {
          const sourceStorageKey = clip.clippingSession?.file?.storageKey;
          if (!sourceStorageKey) {
            console.error(`No source storage key for clip ${clip.id}`);
            return null;
          }

          return runEffect(
            Effect.flatMap(QueueService, (queue) =>
              queue.enqueueClipGeneration({
                clipId: clip.id,
                sourceStorageKey,
                startTime: clip.startTime,
                endTime: clip.endTime,
              }),
            ),
          );
        }),
      );

      const successfulEnqueues = enqueueResults.filter((r) => r !== null);

      return {
        exportedCount: successfulEnqueues.length,
        queuePosition: successfulEnqueues[0]?.position ?? 0,
      };
    }),

  // Retry a failed clip export
  retryClip: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get the failed clip with session and file info
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.clipId),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: { clippingSession: { with: { file: true } } },
      });

      if (!clip) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clip not found",
        });
      }

      if (clip.status !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only failed clips can be retried",
        });
      }

      const sourceStorageKey = clip.clippingSession?.file?.storageKey;
      if (!sourceStorageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source audio file not found",
        });
      }

      // 2. Reset clip status
      await ctx.db
        .update(clips)
        .set({
          status: "pending",
          errorMessage: null,
        })
        .where(eq(clips.id, input.clipId));

      // 3. Re-enqueue to BullMQ
      const result = await runEffect(
        Effect.flatMap(QueueService, (queue) =>
          queue.enqueueClipGeneration({
            clipId: clip.id,
            sourceStorageKey,
            startTime: clip.startTime,
            endTime: clip.endTime,
          }),
        ),
      );

      return {
        clipId: result.clipId,
        queuePosition: result.position,
      };
    }),

  // Retry all failed clip exports for a session
  retryAllFailed: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get all failed clips for this session
      const failedClips = await ctx.db.query.clips.findMany({
        where: and(
          eq(clips.clippingSessionId, input.sessionId),
          eq(clips.userId, ctx.session.user.id),
          eq(clips.status, "failed"),
        ),
      });

      if (failedClips.length === 0) {
        return { retriedCount: 0 };
      }

      // 2. Get source storage key from session
      const session = await ctx.db.query.clippingSessions.findFirst({
        where: eq(clippingSessions.id, input.sessionId),
        with: { file: true },
      });

      const sourceStorageKey = session?.file?.storageKey;
      if (!sourceStorageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source audio file not found",
        });
      }

      // 3. Reset all failed clips
      await ctx.db
        .update(clips)
        .set({
          status: "pending",
          errorMessage: null,
        })
        .where(
          inArray(
            clips.id,
            failedClips.map((c) => c.id),
          ),
        );

      // 4. Re-enqueue all
      await Promise.all(
        failedClips.map((clip) =>
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

      return { retriedCount: failedClips.length };
    }),

  // Delete clips
  deleteClips: protectedProcedure
    .input(z.object({ clipIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Get clips with file info for cleanup
      const clipsToDelete = await ctx.db.query.clips.findMany({
        where: and(
          inArray(clips.id, input.clipIds),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: { file: true },
      });

      if (clipsToDelete.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No clips found",
        });
      }

      // Delete files from R2 for exported clips
      const filesToDelete = clipsToDelete
        .map((c) => c.file?.storageKey)
        .filter((key): key is string => key !== null && key !== undefined);

      if (filesToDelete.length > 0) {
        await Promise.all(
          filesToDelete.map((key) =>
            runEffect(
              Effect.flatMap(StorageService, (storage) =>
                storage.deleteObject({ key }),
              ),
            ).catch((err) => {
              console.error(`Failed to delete file ${key}:`, err);
            }),
          ),
        );
      }

      // Delete clip records
      await ctx.db.delete(clips).where(
        inArray(
          clips.id,
          clipsToDelete.map((c) => c.id),
        ),
      );

      return { deletedCount: clipsToDelete.length };
    }),
});

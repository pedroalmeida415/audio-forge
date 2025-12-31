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

      // Get queue position if still pending
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

  // Get presigned URL for clip playback
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clip file not found",
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

  // Retry a failed clip
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

  // Retry all failed clips for a session
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
});

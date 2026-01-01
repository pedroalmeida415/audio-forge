import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import { QueueService, ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, QueueService | StorageService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const clipsRouter = createTRPCRouter({
  // List clips by speaker (via segment → speaker join)
  listBySpeaker: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clips
        .findMany({
          where: eq(clips.userId, ctx.session.user.id),
          with: {
            segment: {
              with: { speaker: true },
            },
          },
          orderBy: (clips, { desc }) => [desc(clips.createdAt)],
        })
        .then((results) =>
          results.filter((clip) => clip.segment.speakerId === input.speakerId),
        );
    }),

  // List clips by clipping session (via segment → session join)
  listBySession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clips
        .findMany({
          where: eq(clips.userId, ctx.session.user.id),
          with: {
            segment: true,
          },
          orderBy: (clips, { desc }) => [desc(clips.createdAt)],
        })
        .then((results) =>
          results.filter((clip) => clip.segment.sessionId === input.sessionId),
        );
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
      // 1. Get the failed clip with segment → session → file chain
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.clipId),
          eq(clips.userId, ctx.session.user.id),
        ),
        with: {
          segment: {
            with: {
              session: {
                with: { file: true },
              },
            },
          },
        },
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

      const sourceStorageKey = clip.segment.session?.file?.storageKey;
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

      // 3. Re-enqueue to BullMQ (times come from segment)
      const result = await runEffect(
        Effect.flatMap(QueueService, (queue) =>
          queue.enqueueClipGeneration({
            clipId: clip.id,
            sourceStorageKey,
            startTime: clip.segment.startTime,
            endTime: clip.segment.endTime,
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
      // 1. Get all failed clips for this session (via segment → session join)
      const allFailedClips = await ctx.db.query.clips.findMany({
        where: and(
          eq(clips.userId, ctx.session.user.id),
          eq(clips.status, "failed"),
        ),
        with: {
          segment: {
            with: {
              session: {
                with: { file: true },
              },
            },
          },
        },
      });

      // Filter to only clips from the requested session
      const failedClips = allFailedClips.filter(
        (clip) => clip.segment.sessionId === input.sessionId,
      );

      if (failedClips.length === 0) {
        return { retriedCount: 0 };
      }

      // Get source storage key from the first clip's segment chain
      const sourceStorageKey =
        failedClips[0]?.segment.session?.file?.storageKey;
      if (!sourceStorageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source audio file not found",
        });
      }

      // 2. Reset all failed clips
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

      // 3. Re-enqueue all (times come from segment)
      await Promise.all(
        failedClips.map((clip) =>
          runEffect(
            Effect.flatMap(QueueService, (queue) =>
              queue.enqueueClipGeneration({
                clipId: clip.id,
                sourceStorageKey,
                startTime: clip.segment.startTime,
                endTime: clip.segment.endTime,
              }),
            ),
          ),
        ),
      );

      return { retriedCount: failedClips.length };
    }),
});

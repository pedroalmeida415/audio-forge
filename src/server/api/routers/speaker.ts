import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type Clip,
  clips,
  projects,
  segments,
  speakers,
} from "~/server/db/schema";
import { QueueService, ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, QueueService | StorageService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

/**
 * Segment with its associated clip and session info for media-proxy
 */
export interface SegmentWithClip {
  id: string;
  sessionId: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  transcription: string | null;
  clip: Clip | null;
  session: { fileStorageKey: string };
}

export const speakerRouter = createTRPCRouter({
  /**
   * Get speaker with all segments and clips
   *
   * Returns speaker details along with all segments assigned to this speaker,
   * including their clips (if processed) and session info for media-proxy access.
   */
  getWithSegments: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 1. Get the speaker
      const speaker = await ctx.db.query.speakers.findFirst({
        where: eq(speakers.id, input.speakerId),
        with: {
          project: true,
        },
      });

      if (!speaker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      // 2. Verify ownership through project
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, speaker.projectId),
      });

      if (!project || project.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this speaker",
        });
      }

      // 3. Get all segments for this speaker with their clips and session info
      const speakerSegments = await ctx.db.query.segments.findMany({
        where: eq(segments.speakerId, input.speakerId),
        orderBy: (seg, { asc }) => [asc(seg.startTime)],
        with: {
          clip: true,
          session: {
            with: {
              file: {
                columns: {
                  storageKey: true,
                },
              },
            },
          },
        },
      });

      // 4. Transform to SegmentWithClip structure
      const segmentsWithClips: SegmentWithClip[] = speakerSegments.map(
        (seg) => ({
          id: seg.id,
          sessionId: seg.sessionId,
          speakerId: seg.speakerId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          transcription: seg.transcription,
          clip: seg.clip ?? null,
          session: {
            fileStorageKey: seg.session.file?.storageKey ?? "",
          },
        }),
      );

      return {
        speaker,
        segments: segmentsWithClips,
      };
    }),

  /**
   * Update segment transcription
   *
   * Updates the transcription text for a segment after verifying ownership
   * through the segment -> speaker -> project -> user chain.
   */
  updateTranscription: protectedProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        transcription: z.string().max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get the segment with speaker and project info for ownership verification
      const segment = await ctx.db.query.segments.findFirst({
        where: eq(segments.id, input.segmentId),
        with: {
          speaker: {
            with: {
              project: true,
            },
          },
        },
      });

      if (!segment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      // 2. Verify ownership via segment -> speaker -> project -> user chain
      if (segment.speaker.project.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this segment",
        });
      }

      // 3. Update the transcription
      await ctx.db
        .update(segments)
        .set({ transcription: input.transcription })
        .where(eq(segments.id, input.segmentId));

      return { success: true };
    }),

  /**
   * Enqueue transcription jobs for segments
   *
   * Queues transcription jobs for the specified segments after verifying ownership.
   * Returns the count of successfully queued jobs.
   */
  enqueueTranscription: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.segmentIds.length === 0) {
        return { queuedCount: 0 };
      }

      // 1. Get all segments with ownership info
      const segmentsToQueue = await ctx.db.query.segments.findMany({
        where: inArray(segments.id, input.segmentIds),
        with: {
          speaker: {
            with: {
              project: true,
            },
          },
          clip: true,
        },
      });

      // 2. Verify all segments exist and user owns them
      if (segmentsToQueue.length !== input.segmentIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more segments not found",
        });
      }

      for (const segment of segmentsToQueue) {
        if (segment.speaker.project.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to one or more segments",
          });
        }
      }

      // 3. Queue transcription jobs
      const results = await runEffect(
        Effect.flatMap(QueueService, (queue) =>
          Effect.all(
            segmentsToQueue.map((segment) =>
              queue.enqueueTranscription({
                segmentId: segment.id,
                clipStorageKey: segment.clip?.storageKey ?? undefined,
              }),
            ),
          ),
        ),
      );

      return { queuedCount: results.length };
    }),

  /**
   * Enqueue clip processing jobs for segments
   *
   * Queues processing jobs (generate, denoise, overlap removal) for the specified
   * segments after verifying ownership. Returns the count of successfully queued jobs.
   */
  enqueueProcessing: protectedProcedure
    .input(
      z.object({
        segmentIds: z.array(z.string().uuid()),
        operations: z.array(z.enum(["generate", "denoise", "overlap"])),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.segmentIds.length === 0 || input.operations.length === 0) {
        return { queuedCount: 0 };
      }

      // 1. Get all segments with ownership info
      const segmentsToQueue = await ctx.db.query.segments.findMany({
        where: inArray(segments.id, input.segmentIds),
        with: {
          speaker: {
            with: {
              project: true,
            },
          },
        },
      });

      // 2. Verify all segments exist and user owns them
      if (segmentsToQueue.length !== input.segmentIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more segments not found",
        });
      }

      for (const segment of segmentsToQueue) {
        if (segment.speaker.project.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to one or more segments",
          });
        }
      }

      // 3. Queue clip processing jobs
      const results = await runEffect(
        Effect.flatMap(QueueService, (queue) =>
          Effect.all(
            segmentsToQueue.map((segment) =>
              queue.enqueueClipProcessing({
                segmentId: segment.id,
                operations: input.operations,
              }),
            ),
          ),
        ),
      );

      return { queuedCount: results.length };
    }),

  /**
   * Delete a clip (reset processing)
   *
   * Deletes the clip from R2 storage and the database after verifying ownership
   * through the clip -> segment -> speaker -> project -> user chain.
   */
  deleteClip: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get the clip with ownership info
      const clip = await ctx.db.query.clips.findFirst({
        where: eq(clips.id, input.clipId),
        with: {
          segment: {
            with: {
              speaker: {
                with: {
                  project: true,
                },
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

      // 2. Verify ownership via clip -> segment -> speaker -> project -> user chain
      if (clip.segment.speaker.project.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this clip",
        });
      }

      // 3. Delete from R2 if storage key exists
      if (clip.storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: clip.storageKey as string }),
          ),
        );
      }

      // 4. Delete from database
      await ctx.db.delete(clips).where(eq(clips.id, input.clipId));

      return { success: true };
    }),

  /**
   * Get queue status
   *
   * Returns the current status of clip processing and transcription queues,
   * including waiting and active job counts.
   */
  getQueueStatus: protectedProcedure.query(async () => {
    const status = await runEffect(
      Effect.flatMap(QueueService, (queue) => queue.getProcessingQueueStatus()),
    );

    return status;
  }),

  /**
   * Get pre-signed URL for clip audio playback
   *
   * Generates a pre-signed URL with 15 minute expiration for downloading
   * clip audio from R2 storage after verifying ownership through the
   * clip -> segment -> speaker -> project -> user chain.
   */
  getClipPresignedUrl: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 1. Get the clip with ownership info
      const clip = await ctx.db.query.clips.findFirst({
        where: eq(clips.id, input.clipId),
        with: {
          segment: {
            with: {
              speaker: {
                with: {
                  project: true,
                },
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

      // 2. Verify ownership via clip -> segment -> speaker -> project -> user chain
      if (clip.segment.speaker.project.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this clip",
        });
      }

      // 3. Check if clip has a storage key
      if (!clip.storageKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Clip has no audio file",
        });
      }

      // 4. Generate pre-signed URL with 15 minute expiration (900 seconds)
      const expiresInSeconds = 900;
      const url = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: clip.storageKey as string,
            expiresIn: expiresInSeconds,
          }),
        ),
      );

      // 5. Calculate expiration timestamp (Unix timestamp in milliseconds)
      const expiresAt = Date.now() + expiresInSeconds * 1000;

      return { url, expiresAt };
    }),
});

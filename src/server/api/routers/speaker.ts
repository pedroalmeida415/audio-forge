import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type Clip,
  clips,
  clippingSessions,
  files,
  projects,
  segments,
  speakers,
} from "~/server/db/schema";

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
});

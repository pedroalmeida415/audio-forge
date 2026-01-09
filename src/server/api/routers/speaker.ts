import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { segments, speakers } from "~/server/db/schema";

export const speakerRouter = createTRPCRouter({
  // Get speaker by ID with basic info
  getById: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const speaker = await ctx.db.query.speakers.findFirst({
        where: and(
          eq(speakers.id, input.speakerId),
          eq(speakers.userId, ctx.session.user.id),
        ),
        with: {
          project: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!speaker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Speaker not found",
        });
      }

      // Count segments for this speaker
      const speakerSegments = await ctx.db.query.segments.findMany({
        where: eq(segments.speakerId, input.speakerId),
        columns: { id: true },
      });

      return {
        ...speaker,
        segmentCount: speakerSegments.length,
      };
    }),

  // Get all segments for a speaker across all sessions
  // Each segment includes the file's storageKey and name for audio streaming
  getSegmentsBySpeaker: protectedProcedure
    .input(z.object({ speakerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify speaker ownership
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

      // Get segments with session and file info
      const speakerSegments = await ctx.db.query.segments.findMany({
        where: eq(segments.speakerId, input.speakerId),
        orderBy: (seg, { asc }) => [asc(seg.createdAt)],
        with: {
          session: {
            columns: {
              id: true,
              name: true,
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
          },
        },
      });

      // Transform to flat structure for client consumption
      return speakerSegments.map((seg) => ({
        id: seg.id,
        speakerId: seg.speakerId,
        sessionId: seg.sessionId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        createdAt: seg.createdAt,
        // File info for audio streaming
        storageKey: seg.session.file?.storageKey ?? null,
        fileName: seg.session.file?.name ?? seg.session.name ?? "Untitled",
        sessionName: seg.session.name,
      }));
    }),
});

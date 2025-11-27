import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { collections, segments } from "~/server/db/schema";

export const segmentRouter = createTRPCRouter({
  /**
   * List segments for an audio file
   */
  listByAudioFile: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.db.query.segments.findMany({
        where: eq(segments.audioFileId, input.audioFileId),
        orderBy: (segment, { asc }) => [asc(segment.editedStartTime)],
        with: {
          collection: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      })
    ),

  /**
   * Get unique speakers from an audio file's segments
   */
  getSpeakers: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const allSegments = await ctx.db.query.segments.findMany({
        where: eq(segments.audioFileId, input.audioFileId),
        columns: {
          pyannoteSpeakerLabel: true,
          collectionId: true,
        },
        with: {
          collection: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Group by speaker label
      const speakerMap = new Map<
        string,
        {
          label: string;
          segmentCount: number;
          collection: { id: string; name: string } | null;
        }
      >();

      for (const seg of allSegments) {
        const existing = speakerMap.get(seg.pyannoteSpeakerLabel);
        if (existing) {
          existing.segmentCount += 1;
        } else {
          speakerMap.set(seg.pyannoteSpeakerLabel, {
            label: seg.pyannoteSpeakerLabel,
            segmentCount: 1,
            collection: seg.collection,
          });
        }
      }

      return [...speakerMap.values()];
    }),

  /**
   * Update segment timestamps (0.1s precision)
   */
  updateTimestamps: publicProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        editedStartTime: z.number().min(0).multipleOf(0.1),
        editedEndTime: z.number().min(0).multipleOf(0.1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.editedStartTime >= input.editedEndTime) {
        throw new Error("Start time must be less than end time");
      }

      const [segment] = await ctx.db
        .update(segments)
        .set({
          editedStartTime: input.editedStartTime,
          editedEndTime: input.editedEndTime,
        })
        .where(eq(segments.id, input.segmentId))
        .returning();

      if (!segment) {
        throw new Error("Segment not found");
      }

      return segment;
    }),

  /**
   * Reset segment timestamps to original Pyannote values
   */
  resetTimestamps: publicProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current segment to retrieve original times
      const current = await ctx.db.query.segments.findFirst({
        where: eq(segments.id, input.segmentId),
        columns: {
          originalStartTime: true,
          originalEndTime: true,
        },
      });

      if (!current) {
        throw new Error("Segment not found");
      }

      const [segment] = await ctx.db
        .update(segments)
        .set({
          editedStartTime: current.originalStartTime,
          editedEndTime: current.originalEndTime,
        })
        .where(eq(segments.id, input.segmentId))
        .returning();

      return segment;
    }),

  /**
   * Assign a segment to a collection
   */
  assignCollection: publicProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        collectionId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If assigning to a collection, verify it exists
      if (input.collectionId) {
        const collection = await ctx.db.query.collections.findFirst({
          where: eq(collections.id, input.collectionId),
          columns: { id: true },
        });

        if (!collection) {
          throw new Error("Collection not found");
        }
      }

      const [segment] = await ctx.db
        .update(segments)
        .set({
          collectionId: input.collectionId,
          status: input.collectionId ? "approved" : "pending",
        })
        .where(eq(segments.id, input.segmentId))
        .returning();

      if (!segment) {
        throw new Error("Segment not found");
      }

      return segment;
    }),

  /**
   * Bulk assign all segments with a specific speaker label to a collection
   */
  bulkAssignByLabel: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
        pyannoteSpeakerLabel: z.string(),
        collectionId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If assigning to a collection, verify it exists
      if (input.collectionId) {
        const collection = await ctx.db.query.collections.findFirst({
          where: eq(collections.id, input.collectionId),
          columns: { id: true },
        });

        if (!collection) {
          throw new Error("Collection not found");
        }
      }

      const result = await ctx.db
        .update(segments)
        .set({
          collectionId: input.collectionId,
          status: input.collectionId ? "approved" : "pending",
        })
        .where(
          and(
            eq(segments.audioFileId, input.audioFileId),
            eq(segments.pyannoteSpeakerLabel, input.pyannoteSpeakerLabel)
          )
        )
        .returning({ id: segments.id });

      return { updatedCount: result.length };
    }),

  /**
   * Exclude/include a segment from processing
   */
  setExcluded: publicProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        excluded: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [segment] = await ctx.db
        .update(segments)
        .set({
          status: input.excluded ? "excluded" : "pending",
          collectionId: input.excluded ? null : undefined,
        })
        .where(eq(segments.id, input.segmentId))
        .returning();

      if (!segment) {
        throw new Error("Segment not found");
      }

      return segment;
    }),

  /**
   * Bulk exclude all segments with a specific speaker label
   */
  bulkExcludeByLabel: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
        pyannoteSpeakerLabel: z.string(),
        excluded: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(segments)
        .set({
          status: input.excluded ? "excluded" : "pending",
          collectionId: input.excluded ? null : undefined,
        })
        .where(
          and(
            eq(segments.audioFileId, input.audioFileId),
            eq(segments.pyannoteSpeakerLabel, input.pyannoteSpeakerLabel)
          )
        )
        .returning({ id: segments.id });

      return { updatedCount: result.length };
    }),

  /**
   * Add notes to a segment
   */
  updateNotes: publicProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        notes: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [segment] = await ctx.db
        .update(segments)
        .set({ notes: input.notes })
        .where(eq(segments.id, input.segmentId))
        .returning();

      if (!segment) {
        throw new Error("Segment not found");
      }

      return segment;
    }),

  /**
   * Get segments ready for extraction (approved with collection assigned)
   */
  getExtractable: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.db.query.segments.findMany({
        where: and(
          eq(segments.audioFileId, input.audioFileId),
          eq(segments.status, "approved")
        ),
        orderBy: (segment, { asc }) => [asc(segment.editedStartTime)],
        with: {
          collection: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      })
    ),
});

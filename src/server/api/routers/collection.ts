import { eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { collections, projects } from "~/server/db/schema";

const speakerMetadataSchema = z
  .object({
    notes: z.string().optional(),
    voiceCharacteristics: z.string().optional(),
    language: z.string().optional(),
  })
  .optional();

export const collectionRouter = createTRPCRouter({
  /**
   * Create a new collection within a project
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        speakerMetadata: speakerMetadataSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project exists
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { id: true },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const [collection] = await ctx.db
        .insert(collections)
        .values({
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          speakerMetadata: input.speakerMetadata,
        })
        .returning();

      return collection;
    }),

  /**
   * List collections for a project with clip counts
   */
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.collections.findMany({
        where: eq(collections.projectId, input.projectId),
        limit: input.limit,
        offset: input.offset,
        orderBy: (collectionsTable, { asc }) => [asc(collectionsTable.name)],
        with: {
          clips: {
            columns: { id: true, clipType: true },
          },
        },
      });

      return result.map((collection) => ({
        ...collection,
        _count: {
          clips: collection.clips.filter((c) => c.clipType === "original")
            .length,
          processedClips: collection.clips.filter(
            (c) => c.clipType === "processed"
          ).length,
        },
        clips: undefined,
      }));
    }),

  /**
   * Get a single collection by ID with clips and processed versions
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.query.collections.findFirst({
        where: eq(collections.id, input.id),
        with: {
          project: {
            columns: {
              id: true,
              name: true,
            },
          },
          clips: {
            orderBy: (clipsTable, { desc }) => [desc(clipsTable.createdAt)],
          },
        },
      });

      if (!collection) {
        throw new Error("Collection not found");
      }

      // Separate original clips and their processed versions
      const originalClips = collection.clips.filter(
        (c) => c.clipType === "original"
      );
      const processedClipsMap = new Map<string, typeof collection.clips>();

      for (const clip of collection.clips) {
        if (clip.clipType === "processed" && clip.originalClipId) {
          const existing = processedClipsMap.get(clip.originalClipId) ?? [];
          existing.push(clip);
          processedClipsMap.set(clip.originalClipId, existing);
        }
      }

      return {
        ...collection,
        audioClips: originalClips.map((clip) => ({
          ...clip,
          // Denormalized data is already on the clip
          speakerLabel: clip.sourceSpeakerLabel,
          sourceFilename: clip.sourceFilename,
          processedClips: processedClipsMap.get(clip.id) ?? [],
        })),
        clips: undefined,
      };
    }),

  /**
   * Update a collection
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        speakerMetadata: speakerMetadataSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const [collection] = await ctx.db
        .update(collections)
        .set(data)
        .where(eq(collections.id, id))
        .returning();

      if (!collection) {
        throw new Error("Collection not found");
      }

      return collection;
    }),

  /**
   * Delete a collection (clips will be cascade deleted)
   */
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(collections)
        .where(eq(collections.id, input.id))
        .returning({ id: collections.id });

      if (!deleted) {
        throw new Error("Collection not found");
      }

      return { success: true, deletedId: deleted.id };
    }),

  /**
   * Search collections by name within a project (for creatable select)
   */
  search: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        query: z.string().optional(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.collections.findMany({
        where: eq(collections.projectId, input.projectId),
        limit: input.limit,
        orderBy: (collectionsTable, { asc }) => [asc(collectionsTable.name)],
        columns: {
          id: true,
          name: true,
        },
      });

      // Filter by query if provided
      if (input.query) {
        const lowerQuery = input.query.toLowerCase();
        return result.filter((c) => c.name.toLowerCase().includes(lowerQuery));
      }

      return result;
    }),

  /**
   * Search collections globally across ALL projects (for segment assignment in clipping workspace)
   */
  searchGlobal: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.collections.findMany({
        where: ilike(collections.name, `%${input.query}%`),
        limit: input.limit,
        orderBy: (collectionsTable, { asc }) => [asc(collectionsTable.name)],
        columns: {
          id: true,
          name: true,
        },
        with: {
          project: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      return result;
    }),

  /**
   * List all collections globally (for empty query state in combobox)
   */
  listAll: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.collections.findMany({
        limit: input.limit,
        orderBy: (collectionsTable, { asc }) => [asc(collectionsTable.name)],
        columns: {
          id: true,
          name: true,
        },
        with: {
          project: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      return result;
    }),
});

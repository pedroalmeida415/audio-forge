import { eq } from "drizzle-orm";
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
   * List collections for a project
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
          segments: {
            columns: { id: true },
          },
          audioClips: {
            columns: { id: true },
          },
        },
      });

      return result.map((collection) => ({
        ...collection,
        _count: {
          segments: collection.segments.length,
          audioClips: collection.audioClips.length,
        },
        segments: undefined,
        audioClips: undefined,
      }));
    }),

  /**
   * Get a single collection by ID
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
          audioClips: {
            orderBy: (clips, { desc }) => [desc(clips.createdAt)],
            limit: 50,
          },
        },
      });

      if (!collection) {
        throw new Error("Collection not found");
      }

      return collection;
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
   * Delete a collection (segments will have collectionId set to null, clips will be deleted)
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
});

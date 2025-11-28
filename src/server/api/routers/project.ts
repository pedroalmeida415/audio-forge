import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { projects } from "~/server/db/schema";

export const projectRouter = createTRPCRouter({
  /**
   * Create a new project
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description,
        })
        .returning();

      return project;
    }),

  /**
   * List all projects with optional pagination
   */
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const result = await ctx.db.query.projects.findMany({
        limit,
        offset,
        orderBy: (projectsTable, { desc }) => [desc(projectsTable.createdAt)],
        with: {
          collections: {
            columns: {
              id: true,
            },
          },
        },
      });

      return result.map((project) => ({
        ...project,
        _count: {
          collections: project.collections.length,
        },
        collections: undefined,
      }));
    }),

  /**
   * Get a single project by ID with related data
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
        with: {
          collections: {
            orderBy: (collectionsTable, { asc }) => [
              asc(collectionsTable.name),
            ],
          },
        },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      return project;
    }),

  /**
   * Update a project
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const [project] = await ctx.db
        .update(projects)
        .set(data)
        .where(eq(projects.id, id))
        .returning();

      if (!project) {
        throw new Error("Project not found");
      }

      return project;
    }),

  /**
   * Delete a project (cascades to collections, jobs, files, segments, clips)
   */
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(projects)
        .where(eq(projects.id, input.id))
        .returning({ id: projects.id });

      if (!deleted) {
        throw new Error("Project not found");
      }

      return { success: true, deletedId: deleted.id };
    }),
});

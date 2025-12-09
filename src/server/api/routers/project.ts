import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { collections, projects } from "~/server/db/schema";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.query.projects.findMany({
      where: eq(projects.userId, ctx.session.user.id),
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
      extras: {
        collectionsCount:
          sql<number>`(select count(*) from ${collections} where ${collections.projectId} = ${projects.id})`.as(
            "collections_count",
          ),
      },
    });

    return result;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.id),
          eq(projects.userId, ctx.session.user.id),
        ),
        with: {
          collections: {
            orderBy: (collections, { desc }) => [desc(collections.createdAt)],
          },
        },
      });

      return project ?? null;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description,
          userId: ctx.session.user.id,
        })
        .returning();

      if (!project) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create project",
        });
      }

      return project;
    }),
});

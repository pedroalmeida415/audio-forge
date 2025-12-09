import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { collections } from "~/server/db/schema";

export const collectionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.collections.findMany({
        where: and(
          eq(collections.projectId, input.projectId),
          eq(collections.userId, ctx.session.user.id),
        ),
        orderBy: (collections, { desc }) => [desc(collections.createdAt)],
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.query.collections.findFirst({
        where: and(
          eq(collections.id, input.id),
          eq(collections.userId, ctx.session.user.id),
        ),
        with: {
          project: true,
        },
      });

      return collection ?? null;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [collection] = await ctx.db
        .insert(collections)
        .values({
          projectId: input.projectId,
          userId: ctx.session.user.id,
          name: input.name,
          description: input.description,
        })
        .returning();

      if (!collection) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create collection",
        });
      }

      return collection;
    }),
});

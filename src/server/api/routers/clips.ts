import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";

export const clipsRouter = createTRPCRouter({
  listByCollection: protectedProcedure
    .input(z.object({ collectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.clips.findMany({
        where: and(
          eq(clips.collectionId, input.collectionId),
          eq(clips.userId, ctx.session.user.id),
        ),
        orderBy: (clips, { desc }) => [desc(clips.createdAt)],
      });
    }),
});

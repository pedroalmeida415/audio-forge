import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx, input }) => {
    // TODO: Implement
    return null;
  }),
});

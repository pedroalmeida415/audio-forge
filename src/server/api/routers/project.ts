import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { projects, speakers } from "~/server/db/schema";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.query.projects.findMany({
      where: eq(projects.userId, ctx.session.user.id),
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
      extras: {
        // Count only non-diarization speakers (real speaker identities)
        speakersCount:
          sql<number>`(select count(*) from ${speakers} where ${speakers.projectId} = ${projects.id} and ${speakers.name} not like 'SPEAKER_%')`.as(
            "speakers_count",
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
          // Only include non-diarization speakers in project view
          speakers: {
            orderBy: (speakers, { desc }) => [desc(speakers.createdAt)],
          },
        },
      });

      // Filter out SPEAKER_* speakers from the result
      if (project) {
        return {
          ...project,
          speakers: project.speakers.filter(
            (s) => !s.name.startsWith("SPEAKER_"),
          ),
        };
      }

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

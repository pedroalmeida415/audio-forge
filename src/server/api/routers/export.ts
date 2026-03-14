import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { speakers } from "~/server/db/schema";
import { Database } from "~/services/infra/database";
import {
  AudioJobs,
  type LJSpeechExportPayload,
  QueueService,
  Queues,
} from "~/services/queue/queue-service";

export const exportRouter = createTRPCRouter({
  /**
   * Start an LJSpeech dataset export job for a speaker.
   * Returns the job ID for progress tracking.
   */
  startLJSpeechExport: protectedProcedure
    .input(
      z.object({
        speakerId: z.string().uuid(),
        sampleRate: z.number().int().min(8000).max(48000).default(24000),
        minDuration: z.number().nonnegative().optional(),
        maxDuration: z.number().nonnegative().optional(),
        minScore: z.number().min(1).max(5).optional(),
        maxScore: z.number().min(1).max(5).optional(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Verify speaker exists and belongs to user
            const speaker = yield* db.query.speakers.findFirst({
              where: and(
                eq(speakers.id, input.speakerId),
                eq(speakers.userId, ctx.session.user.id),
              ),
            });

            if (!speaker) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Speaker not found",
                }),
              );
            }

            // Enqueue export job
            const payload: LJSpeechExportPayload = {
              speakerId: input.speakerId,
              userId: ctx.session.user.id,
              sampleRate: input.sampleRate,
              minDuration: input.minDuration,
              maxDuration: input.maxDuration,
              minScore: input.minScore,
              maxScore: input.maxScore,
            };

            const result = yield* QueueService.enqueueJob(
              Queues.AudioProcessing,
              AudioJobs.LJSpeechExport,
              payload,
            );

            return {
              jobId: result.jobId,
              speakerId: input.speakerId,
              sampleRate: input.sampleRate,
              minDuration: input.minDuration,
              maxDuration: input.maxDuration,
              minScore: input.minScore,
              maxScore: input.maxScore,
            };
          }),
        ),
    ),
});

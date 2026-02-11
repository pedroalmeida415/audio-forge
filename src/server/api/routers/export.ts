import { on } from "node:events";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { speakers } from "~/server/db/schema";
import {
  type ExportProgressEvent,
  exportEvents,
} from "~/server/events/export-events";
import { initExportEventsBridge } from "~/server/events/export-events-bridge";
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
            };
          }),
        ),
    ),

  /**
   * SSE subscription for export progress events.
   * Yields progress updates until export completes or fails.
   */
  onExportProgress: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .subscription(async function* (opts) {
      const { jobId } = opts.input;

      // Initialize the bridge to listen for BullMQ events (idempotent)
      initExportEventsBridge();

      // Create an async iterable from the EventEmitter
      const eventName = `export:job:${jobId}`;

      // Listen for events using Node.js on() which returns an async iterable
      for await (const [event] of on(exportEvents, eventName, {
        signal: opts.signal,
      })) {
        const progressEvent = event as ExportProgressEvent;
        yield progressEvent;

        // Close subscription when export completes or fails
        if (
          progressEvent.status === "completed" ||
          progressEvent.status === "failed"
        ) {
          return;
        }
      }
    }),
});

import { Worker } from "bullmq";
import { Effect } from "effect";
import { AppRuntime } from "../../src/services";
import { RedisService } from "../../src/services/infra/redis";
import {
  type AudioJobName,
  AudioJobs,
  QueueService,
  Queues,
} from "../../src/services/queue/queue-service";
import { handleCalculateScore } from "../handlers/calculate-score";
import { handleDenoise } from "../handlers/denoise";
import { handleDiarize } from "../handlers/diarize";
import { handleIngestSource } from "../handlers/ingest-source";
import { handleLJSpeechExport } from "../handlers/ljspeech-export";
import { handleTranscribe } from "../handlers/transcribe";
import type { AnyJobHandler, ClipJobResult } from "./types";

// ============================================================================
// Handler Registry
// ============================================================================

const handlers: Partial<Record<AudioJobName, AnyJobHandler>> = {
  [AudioJobs.IngestSource]: handleIngestSource,
  [AudioJobs.Diarize]: handleDiarize,
  [AudioJobs.Denoise]: handleDenoise,
  [AudioJobs.Transcribe]: handleTranscribe,
  [AudioJobs.CalculateScore]: handleCalculateScore,
  [AudioJobs.LJSpeechExport]: handleLJSpeechExport,
};

const PROCESSING_JOBS: AudioJobName[] = [AudioJobs.Denoise];

/**
 * Start the BullMQ audio processing worker.
 *
 * Uses `acquireUseRelease` to manage the full lifecycle:
 * - Acquire: create the worker and register event handlers
 * - Use: block forever (worker processes jobs via its event loop)
 * - Release: close the worker on interruption/exit
 */
export const startWorker = Effect.acquireUseRelease(
  Effect.gen(function* () {
    const redis = yield* RedisService;

    const worker = new Worker(
      Queues.AudioProcessing,
      async (job) => {
        const jobName = job.name as AudioJobName;
        const handler = handlers[jobName];

        if (!handler) {
          throw new Error(`Unknown job type: ${jobName}`);
        }

        return await AppRuntime.runPromise(handler(job));
      },
      {
        connection: redis,
        concurrency: 10,
      },
    );

    // Auto-enqueue scoring after processing jobs complete
    worker.on("completed", (job) =>
      AppRuntime.runFork(
        Effect.gen(function* () {
          console.log(`[AudioWorker] Job ${job.id} (${job.name}) completed`);

          if (PROCESSING_JOBS.includes(job.name as AudioJobName)) {
            const result = job.returnvalue as ClipJobResult | undefined;
            if (result?.segmentId) {
              yield* QueueService.enqueueJob(
                Queues.AudioProcessing,
                AudioJobs.CalculateScore,
                { entryId: result.segmentId },
              );
              console.log(
                `[AudioWorker] Enqueued scoring for segment ${result.segmentId}`,
              );
            }
          }
        }).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() =>
              console.error("[AudioWorker] Failed to enqueue scoring:", error),
            ),
          ),
        ),
      ),
    );

    worker.on("failed", (job, err) => {
      const attempt = job
        ? `attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}`
        : "";
      console.error(
        `[AudioWorker] Job ${job?.id} (${job?.name}) failed (${attempt}):`,
        err,
      );
    });

    worker.on("error", (err) => {
      console.error("[AudioWorker] Worker error:", err);
    });

    console.log("[AudioWorker] Audio processing worker started");
    console.log(
      `[AudioWorker] Registered handlers: ${Object.keys(handlers).join(", ")}`,
    );

    return worker;
  }),
  // Use: block forever — the worker processes jobs via its Redis event loop
  () => Effect.never,
  // Release: close the worker on interruption/exit
  (worker) =>
    Effect.gen(function* () {
      console.log("[AudioWorker] Closing worker...");
      yield* Effect.promise(() => worker.close(true));
      console.log("[AudioWorker] Worker closed.");
    }),
);

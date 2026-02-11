import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "~/env";
import { Queues } from "~/services/queue/queue-service";
import { clipEvents } from "./clip-events";

/** Clip data from job result */
interface ClipData {
  id: string;
  segmentId: string;
  userId: string;
  storageKey: string;
  duration: number;
  createdAt: string;
}

/** Result returned from clip job handlers */
interface ClipJobResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
}

/**
 * Bridge between BullMQ job completions and SSE events.
 *
 * This module initializes a QueueEvents listener that monitors the audio-processing
 * queue for job completions. When a clip-related job completes, it emits an event
 * to the clipEvents emitter, which SSE subscribers listen to.
 *
 * This is necessary because the worker runs in a separate process from Next.js.
 */

let initialized = false;
let queueEvents: QueueEvents | null = null;

/**
 * Initialize the clip events bridge.
 * Safe to call multiple times - only initializes once.
 */
export function initClipEventsBridge() {
  if (initialized) return;
  initialized = true;

  const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  queueEvents = new QueueEvents(Queues.AudioProcessing, { connection });

  queueEvents.on("completed", ({ jobId, returnvalue }) => {
    if (!returnvalue) return;

    // returnvalue can be a string or already parsed object depending on BullMQ version
    const result: ClipJobResult =
      typeof returnvalue === "string" ? JSON.parse(returnvalue) : returnvalue;

    // Validate it's a clip job result (has required fields)
    if (result.segmentId && result.speakerId && result.clip) {
      console.log(
        `[ClipEventsBridge] Job ${jobId} completed, emitting event for speaker ${result.speakerId}`,
      );

      clipEvents.emitCompletion({
        segmentId: result.segmentId,
        speakerId: result.speakerId,
        clip: {
          ...result.clip,
          processingStatus: null,
          processingError: null,
          scores: null,
        },
        status: "completed",
      });
    }
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`[ClipEventsBridge] Job ${jobId} failed: ${failedReason}`);
  });
}

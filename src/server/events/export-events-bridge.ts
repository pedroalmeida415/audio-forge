import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "~/env";
import { Queues } from "~/services/queue/queue-service";
import { exportEvents } from "./export-events";

/** Result returned from LJSpeech export job handlers */
interface LJSpeechExportResult {
  downloadUrl: string;
  fileCount: number;
  totalDuration: number;
  skippedCount: number;
}

/** Progress data from export job */
interface ExportProgressData {
  type: "export";
  processed: number;
  total: number;
}

/**
 * Bridge between BullMQ job progress/completions and SSE events.
 *
 * This module initializes a QueueEvents listener that monitors the audio-processing
 * queue for export job progress and completions. When an export job makes progress
 * or completes, it emits an event to the exportEvents emitter.
 *
 * This is necessary because the worker runs in a separate process from Next.js.
 */

let initialized = false;
let queueEvents: QueueEvents | null = null;

/**
 * Initialize the export events bridge.
 * Safe to call multiple times - only initializes once.
 */
export function initExportEventsBridge() {
  if (initialized) return;
  initialized = true;

  const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  queueEvents = new QueueEvents(Queues.AudioProcessing, { connection });

  // Listen for progress updates
  queueEvents.on("progress", ({ jobId, data }) => {
    // Check if this is an export progress event
    const progressData = data as ExportProgressData | undefined;
    if (progressData?.type !== "export") return;

    console.log(
      `[ExportEventsBridge] Job ${jobId} progress: ${progressData.processed}/${progressData.total}`,
    );

    exportEvents.emitProgress({
      jobId,
      processed: progressData.processed,
      total: progressData.total,
      status: "processing",
    });
  });

  queueEvents.on("completed", ({ jobId, returnvalue }) => {
    if (!returnvalue) return;

    // returnvalue can be a string or already parsed object depending on BullMQ version
    const result: LJSpeechExportResult | undefined =
      typeof returnvalue === "string" ? JSON.parse(returnvalue) : returnvalue;

    // Validate it's an export job result (has required fields)
    if (
      result?.downloadUrl &&
      typeof result.fileCount === "number" &&
      typeof result.totalDuration === "number"
    ) {
      console.log(
        `[ExportEventsBridge] Job ${jobId} completed, emitting event`,
      );

      exportEvents.emitProgress({
        jobId,
        processed: result.fileCount,
        total: result.fileCount,
        status: "completed",
        downloadUrl: result.downloadUrl,
        fileCount: result.fileCount,
        totalDuration: result.totalDuration,
        skippedCount: result.skippedCount,
      });
    }
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`[ExportEventsBridge] Job ${jobId} failed: ${failedReason}`);

    exportEvents.emitProgress({
      jobId,
      processed: 0,
      total: 0,
      status: "failed",
      error: failedReason,
    });
  });
}

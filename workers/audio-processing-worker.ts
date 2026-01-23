import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import IORedis from "ioredis";

import { env } from "../src/env";
import { files } from "../src/server/db/schema";
import { AppRuntime, disposeRuntime } from "../src/services";
import { AudioProcessingService } from "../src/services/audio/audio-processing-service";
import { Database } from "../src/services/infra/database";
import {
  type AudioJobName,
  type AudioJobPayloads,
  AudioJobs,
  Queues,
} from "../src/services/queue/queue-service";
import { StorageService } from "../src/services/storage/storage-service";

// ============================================================================
// Types
// ============================================================================

type JobHandler<N extends AudioJobName> = (
  job: Job<AudioJobPayloads[N]>,
) => Promise<void>;

type HandlerRegistry = {
  [K in AudioJobName]?: JobHandler<K>;
};

// ============================================================================
// Job Handlers
// ============================================================================

/**
 * Generate waveform data for an audio file.
 * entryId = fileId
 * Downloads audio from R2, generates waveform .dat file, uploads back to R2.
 */
const handleGenerateWaveform: JobHandler = async (job) => {
  const fileId = job.data.entryId;

  await AppRuntime.runPromise(
    Effect.acquireUseRelease(
      // Acquire: Create temp directory
      Effect.sync(() => {
        const tempDir = mkdtempSync(join(tmpdir(), `waveform-${fileId}-`));
        console.log(`[GenerateWaveform] Processing file ${fileId}`);
        return tempDir;
      }),

      // Use: Process waveform
      (tempDir) =>
        Effect.gen(function* () {
          const db = yield* Database;

          // Look up file to get storageKey
          const file = yield* db.query.files.findFirst({
            where: eq(files.id, fileId),
          });

          if (!file?.storageKey) {
            return yield* Effect.fail(
              new Error(`File ${fileId} not found or has no storageKey`),
            );
          }

          const audioStorageKey = file.storageKey;
          const audioLocalPath = join(tempDir, "audio.flac");
          const waveformLocalPath = join(tempDir, "waveform.dat");
          const waveformStorageKey = `${audioStorageKey}.dat`;

          // Update file status to processing
          yield* db
            .update(files)
            .set({ waveformStatus: "processing" })
            .where(eq(files.id, fileId));

          // Download source audio
          console.log(
            `[GenerateWaveform] Downloading audio: ${audioStorageKey}`,
          );
          yield* StorageService.downloadToPath({
            key: audioStorageKey,
            localPath: audioLocalPath,
          });

          // Generate waveform
          console.log("[GenerateWaveform] Generating waveform");
          yield* AudioProcessingService.generateWaveform({
            inputPath: audioLocalPath,
            outputPath: waveformLocalPath,
            samplesPerPixel: 256,
          });

          // Upload waveform to R2
          console.log(
            `[GenerateWaveform] Uploading waveform: ${waveformStorageKey}`,
          );
          yield* StorageService.uploadFromPath({
            localPath: waveformLocalPath,
            key: waveformStorageKey,
            contentType: "application/octet-stream",
          });

          // Update file record with waveform info
          yield* db
            .update(files)
            .set({
              waveformStatus: "completed",
              waveformStorageKey,
              waveformError: null,
            })
            .where(eq(files.id, fileId));

          console.log(`[GenerateWaveform] File ${fileId} completed`);
        }).pipe(
          // Handle errors - update file status to failed
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              const db = yield* Database;
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.error(
                `[GenerateWaveform] File ${fileId} failed:`,
                errorMessage,
              );

              yield* db
                .update(files)
                .set({
                  waveformStatus: "failed",
                  waveformError: errorMessage,
                })
                .where(eq(files.id, fileId))
                .pipe(Effect.catchAll(() => Effect.void));

              return yield* Effect.fail(error);
            }),
          ),
        ),

      // Release: Cleanup temp directory
      (tempDir) =>
        Effect.sync(() => {
          rmSync(tempDir, { recursive: true, force: true });
        }),
    ),
  );
};

/**
 * Denoise a segment's audio.
 * TODO: Implement actual denoising logic
 */
const handleDenoise: JobHandler<"denoise"> = async (job) => {
  const { segmentId } = job.data;
  console.log(`[Denoise] Processing segment ${segmentId}`);
  // TODO: Implement denoising
  // 1. Download segment audio from source file (using startTime/endTime)
  // 2. Apply denoising filter (ffmpeg or external service)
  // 3. Create clip record and upload processed audio
  console.log(`[Denoise] Segment ${segmentId} - not yet implemented`);
};

/**
 * Remove overlapping speech from a segment.
 * TODO: Implement actual overlap removal logic
 */
const handleRemoveOverlap: JobHandler<"remove_overlap"> = async (job) => {
  const { segmentId } = job.data;
  console.log(`[RemoveOverlap] Processing segment ${segmentId}`);
  // TODO: Implement overlap removal
  // 1. Download segment audio
  // 2. Detect and remove overlapping speech regions
  // 3. Create/update clip record
  console.log(`[RemoveOverlap] Segment ${segmentId} - not yet implemented`);
};

/**
 * Transcribe a segment's audio.
 * TODO: Implement actual transcription logic (likely via external API)
 */
const handleTranscribe: JobHandler<"transcribe"> = async (job) => {
  const { segmentId, clipId } = job.data;
  console.log(
    `[Transcribe] Processing segment ${segmentId} (clip: ${clipId ?? "none"})`,
  );
  // TODO: Implement transcription
  // 1. Download audio (from clip if exists, otherwise from source segment)
  // 2. Send to transcription API (Whisper, etc.)
  // 3. Update segment.transcription with result
  console.log(`[Transcribe] Segment ${segmentId} - not yet implemented`);
};

// ============================================================================
// Handler Registry
// ============================================================================

const handlers: HandlerRegistry = {
  [AudioJobs.GenerateWaveform]: handleGenerateWaveform,
  [AudioJobs.Denoise]: handleDenoise,
  [AudioJobs.RemoveOverlap]: handleRemoveOverlap,
  [AudioJobs.Transcribe]: handleTranscribe,
};

// ============================================================================
// Worker Setup
// ============================================================================

const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  Queues.AudioProcessing,
  async (job) => {
    const jobName = job.name as AudioJobName;
    const handler = handlers[jobName];

    if (!handler) {
      console.error(`[AudioWorker] Unknown job type: ${jobName}`);
      throw new Error(`Unknown job type: ${jobName}`);
    }

    // Type assertion is safe here because we're dispatching based on job.name
    // which corresponds to the correct payload type
    await (handler as JobHandler<typeof jobName>)(
      job as Job<AudioJobPayloads[typeof jobName]>,
    );
  },
  {
    connection,
    concurrency: 4, // Process up to 4 jobs in parallel
    limiter: {
      max: 20,
      duration: 60000, // Max 20 jobs per minute
    },
  },
);

// ============================================================================
// Event Handlers
// ============================================================================

worker.on("completed", (job) => {
  console.log(`[AudioWorker] Job ${job.id} (${job.name}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[AudioWorker] Job ${job?.id} (${job?.name}) failed:`,
    err.message,
  );
});

worker.on("error", (err) => {
  console.error("[AudioWorker] Worker error:", err);
});

console.log("[AudioWorker] Audio processing worker started");
console.log(
  `[AudioWorker] Registered handlers: ${Object.keys(handlers).join(", ")}`,
);

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
  console.log("[AudioWorker] Shutting down...");
  await worker.close();
  await connection.quit();
  await disposeRuntime();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

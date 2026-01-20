import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import IORedis from "ioredis";

import { env } from "../src/env";
import { files } from "../src/server/db/schema";
import { AppRuntime, disposeRuntime } from "../src/services";
import { AudioProcessingService } from "../src/services/audio/audio-processing-service";
import { Database } from "../src/services/infra/database";
import type { WaveformJobPayload } from "../src/services/queue/queue-service";
import { StorageService } from "../src/services/storage/storage-service";

// Redis connection for BullMQ worker (separate from Effect services)
const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Create and start worker
const worker = new Worker<WaveformJobPayload>(
  "waveform-generation",
  async (job) => {
    const payload = job.data;
    await AppRuntime.runPromise(
      Effect.acquireUseRelease(
        // Acquire: Create temp directory
        Effect.sync(() => {
          const tempDir = mkdtempSync(
            join(tmpdir(), `waveform-${payload.fileId}-`),
          );
          console.log(`[WaveformWorker] Processing file ${payload.fileId}`);
          return tempDir;
        }),

        // Use: Process waveform
        (tempDir) =>
          Effect.gen(function* () {
            const db = yield* Database;
            const { fileId, audioStorageKey } = payload;
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
              `[WaveformWorker] Downloading audio: ${audioStorageKey}`,
            );
            yield* StorageService.downloadToPath({
              key: audioStorageKey,
              localPath: audioLocalPath,
            });

            // Generate waveform
            console.log("[WaveformWorker] Generating waveform");
            yield* AudioProcessingService.generateWaveform({
              inputPath: audioLocalPath,
              outputPath: waveformLocalPath,
              samplesPerPixel: 256,
            });

            // Upload waveform to R2
            console.log(
              `[WaveformWorker] Uploading waveform: ${waveformStorageKey}`,
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

            console.log(`[WaveformWorker] File ${fileId} waveform completed`);
            return { success: true };
          }).pipe(
            // Handle errors - update file status to failed
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                const db = yield* Database;
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                console.error(
                  `[WaveformWorker] File ${payload.fileId} failed:`,
                  errorMessage,
                );

                yield* db
                  .update(files)
                  .set({
                    waveformStatus: "failed",
                    waveformError: errorMessage,
                  })
                  .where(eq(files.id, payload.fileId))
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
  },
  {
    connection,
    concurrency: 2, // Process 2 waveforms in parallel (CPU intensive)
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

// Event handlers
worker.on("completed", (job) => {
  console.log(`[WaveformWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[WaveformWorker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[WaveformWorker] Worker error:", err);
});

console.log("[WaveformWorker] Waveform generation worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[WaveformWorker] Shutting down...");
  await worker.close();
  await connection.quit();
  await disposeRuntime();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

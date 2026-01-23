import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import IORedis from "ioredis";

import { env } from "../src/env";
import { clips, files, segments } from "../src/server/db/schema";
import { AppRuntime, disposeRuntime } from "../src/services";
import { AudioProcessingService } from "../src/services/audio/audio-processing-service";
import { Database } from "../src/services/infra/database";
import {
  type AudioJobName,
  type AudioJobPayload,
  AudioJobs,
  Queues,
} from "../src/services/queue/queue-service";
import { StorageService } from "../src/services/storage/storage-service";

// ============================================================================
// Media Server Configuration
// ============================================================================

const mediaServerUrl = process.env.MEDIA_SERVER_URL ?? "http://localhost:3002";
const mediaServerToken = process.env.MEDIA_SERVER_INTERNAL_TOKEN;

/**
 * Download a file from the media server to a local path.
 * Uses the media server's caching to avoid redundant R2 downloads.
 */
const downloadFromMediaServer = (params: {
  storageKey: string;
  localPath: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(params.storageKey)}`;
      const headers: Record<string, string> = {};

      if (mediaServerToken) {
        headers.Authorization = `Bearer ${mediaServerToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Media server error: ${response.status} ${response.statusText}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(params.localPath, buffer);
    },
    catch: (error) =>
      new Error(
        `Failed to fetch from media server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Fetch a FLAC slice from the media server.
 * The media server extracts the slice using FFmpeg and returns it as a buffer.
 * Used for creating clips without needing to download the full source file.
 */
const fetchSliceFromMediaServer = (params: {
  storageKey: string;
  startMs: number;
  endMs: number;
}) =>
  Effect.tryPromise({
    try: async () => {
      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(params.storageKey)}&startMs=${params.startMs}&endMs=${params.endMs}&format=flac`;
      const headers: Record<string, string> = {};

      if (mediaServerToken) {
        headers.Authorization = `Bearer ${mediaServerToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Media server error: ${response.status} ${response.statusText}`,
        );
      }

      return Buffer.from(await response.arrayBuffer());
    },
    catch: (error) =>
      new Error(
        `Failed to fetch slice from media server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

// ============================================================================
// Types
// ============================================================================

type JobHandler = (
  job: Job<AudioJobPayload>,
) => Promise<ClipJobResult | undefined>;

type HandlerRegistry = {
  [K in AudioJobName]?: JobHandler;
};

/** Clip data returned from ensureClipExists for SSE notifications */
interface ClipData {
  id: string;
  segmentId: string;
  fileId: string;
  createdAt: string;
  file: {
    id: string;
    storageKey: string;
    duration: number;
  };
}

/** Result of ensureClipExists */
interface EnsureClipResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
}

/** Result returned from clip job handlers for SSE notifications */
export interface ClipJobResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Ensures a clip exists for the given segment.
 * If no clip exists, extracts audio from the source file and creates one.
 * Returns the clip's file info for further processing.
 */
const ensureClipExists = (segmentId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;

    // Look up segment with clip and session relations
    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: {
        clip: {
          with: {
            file: true,
          },
        },
        session: {
          with: {
            file: true,
          },
        },
        speaker: true,
      },
    });

    if (!segment) {
      return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
    }

    // If clip already exists, return its info
    if (segment.clip?.file?.storageKey) {
      return {
        segmentId,
        speakerId: segment.speakerId,
        clip: {
          id: segment.clip.id,
          segmentId,
          fileId: segment.clip.fileId,
          createdAt: segment.clip.createdAt.toISOString(),
          file: {
            id: segment.clip.file.id,
            storageKey: segment.clip.file.storageKey,
            duration: segment.clip.file.duration ?? 0,
          },
        },
      } satisfies EnsureClipResult;
    }

    // No clip exists - need to create one
    const sourceFile = segment.session.file;
    if (!sourceFile?.storageKey) {
      return yield* Effect.fail(
        new Error(`Source file not found for segment ${segmentId}`),
      );
    }

    console.log(
      `[ensureClipExists] Creating clip for segment ${segmentId} (${segment.startTime}s - ${segment.endTime}s)`,
    );

    // Fetch slice directly from media server (no need for temp files)
    const sourceStorageKey = sourceFile.storageKey as string;
    const startMs = segment.startTime * 1000;
    const endMs = segment.endTime * 1000;

    const audioBuffer = yield* fetchSliceFromMediaServer({
      storageKey: sourceStorageKey,
      startMs,
      endMs,
    });

    // Generate storage key for clip
    const clipStorageKey = `clips/${segment.speaker.userId}/${segmentId}.flac`;

    // Upload buffer to R2
    yield* StorageService.uploadBuffer({
      key: clipStorageKey,
      data: audioBuffer,
      contentType: "audio/flac",
    });

    // Calculate duration
    const durationSeconds = segment.endTime - segment.startTime;

    // Create file record
    const [newClipFile] = yield* db
      .insert(files)
      .values({
        userId: segment.speaker.userId,
        projectId: segment.session.projectId,
        storageKey: clipStorageKey,
        name: `clip-${segmentId.slice(0, 8)}.flac`,
        duration: durationSeconds,
      })
      .returning();

    if (!newClipFile) {
      return yield* Effect.fail(
        new Error(`Failed to create file record for clip`),
      );
    }

    // Create clip record
    const [newClip] = yield* db
      .insert(clips)
      .values({
        segmentId,
        fileId: newClipFile.id,
      })
      .returning();

    if (!newClip) {
      return yield* Effect.fail(
        new Error(`Failed to create clip record for segment ${segmentId}`),
      );
    }

    console.log(
      `[ensureClipExists] Created clip for segment ${segmentId}: ${clipStorageKey}`,
    );

    return {
      segmentId,
      speakerId: segment.speakerId,
      clip: {
        id: newClip.id,
        segmentId,
        fileId: newClipFile.id,
        createdAt: newClip.createdAt.toISOString(),
        file: {
          id: newClipFile.id,
          storageKey: clipStorageKey,
          duration: durationSeconds,
        },
      },
    } satisfies EnsureClipResult;
  });

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

          // Download source audio from media server (benefits from caching)
          console.log(
            `[GenerateWaveform] Downloading audio: ${audioStorageKey}`,
          );
          yield* downloadFromMediaServer({
            storageKey: audioStorageKey,
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

  // Waveform jobs don't return clip data (they're for files, not segments)
  return undefined;
};

/**
 * Denoise a segment's audio.
 * entryId = segmentId
 * Ensures clip exists, then applies denoising filter.
 * TODO: Implement actual denoising logic
 */
const handleDenoise: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  console.log(`[Denoise] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      // Ensure clip exists (creates if needed)
      const result = yield* ensureClipExists(segmentId);
      console.log(`[Denoise] Clip ready: ${result.clip.file.storageKey}`);

      // TODO: Implement denoising
      // 1. Download audio from result.clip.file.storageKey
      // 2. Apply denoising filter (ffmpeg or external service)
      // 3. Upload processed audio (update file or create new version)
      console.log(
        `[Denoise] Segment ${segmentId} - processing not yet implemented`,
      );

      return result satisfies ClipJobResult;
    }),
  );
};

/**
 * Remove overlapping speech from a segment's audio.
 * entryId = segmentId
 * Ensures clip exists, then removes overlapping speech.
 * TODO: Implement actual overlap removal logic
 */
const handleRemoveOverlap: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  console.log(`[RemoveOverlap] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      // Ensure clip exists (creates if needed)
      const result = yield* ensureClipExists(segmentId);
      console.log(`[RemoveOverlap] Clip ready: ${result.clip.file.storageKey}`);

      // TODO: Implement overlap removal
      // 1. Download audio from result.clip.file.storageKey
      // 2. Detect and remove overlapping speech regions
      // 3. Upload processed audio (update file or create new version)
      console.log(
        `[RemoveOverlap] Segment ${segmentId} - processing not yet implemented`,
      );

      return result satisfies ClipJobResult;
    }),
  );
};

/**
 * Transcribe a segment's audio.
 * entryId = segmentId
 * Ensures clip exists, then transcribes and saves to segment.
 * TODO: Implement actual transcription logic (likely via external API)
 */
const handleTranscribe: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  console.log(`[Transcribe] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      // Ensure clip exists (creates if needed)
      const result = yield* ensureClipExists(segmentId);
      console.log(`[Transcribe] Clip ready: ${result.clip.file.storageKey}`);

      // TODO: Implement transcription
      // 1. Download audio from result.clip.file.storageKey
      // 2. Send to transcription API (Whisper, etc.)
      // 3. Update segment.transcription with result:
      //    const db = yield* Database;
      //    yield* db.update(segments).set({ transcription: result }).where(eq(segments.id, segmentId));
      console.log(
        `[Transcribe] Segment ${segmentId} - processing not yet implemented`,
      );

      return result satisfies ClipJobResult;
    }),
  );
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

const worker = new Worker<AudioJobPayload>(
  Queues.AudioProcessing,
  async (job) => {
    const jobName = job.name as AudioJobName;
    const handler = handlers[jobName];

    if (!handler) {
      console.error(`[AudioWorker] Unknown job type: ${jobName}`);
      throw new Error(`Unknown job type: ${jobName}`);
    }

    return await handler(job);
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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Job, Queue, Worker } from "bullmq";
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
// Server Configuration
// ============================================================================

const mediaServerUrl = process.env.MEDIA_SERVER_URL ?? "http://localhost:3002";
const mediaServerToken = process.env.MEDIA_SERVER_INTERNAL_TOKEN;
const speechProcessingServerUrl =
  process.env.SPEECH_PROCESSING_SERVER_URL ?? "http://localhost:8000";

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

/** Context needed to create a clip from an audio buffer */
interface SegmentContext {
  segmentId: string;
  speakerId: string;
  userId: string;
  projectId: string;
  startTime: number;
  endTime: number;
}

/** Result of extractSegmentAudio */
interface ExtractSegmentResult {
  audioBuffer: Buffer;
  context: SegmentContext;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract audio buffer from a segment's source file.
 * Does NOT create any DB records or upload to R2.
 * Returns the raw audio buffer and context needed for further processing.
 */
const extractSegmentAudio = (segmentId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;

    // Look up segment with session relations (no clip needed)
    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: {
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

    const sourceFile = segment.session.file;
    if (!sourceFile?.storageKey) {
      return yield* Effect.fail(
        new Error(`Source file not found for segment ${segmentId}`),
      );
    }

    console.log(
      `[extractSegmentAudio] Extracting audio for segment ${segmentId} (${segment.startTime}s - ${segment.endTime}s)`,
    );

    // Fetch slice from media server
    const startMs = segment.startTime * 1000;
    const endMs = segment.endTime * 1000;

    const audioBuffer = yield* fetchSliceFromMediaServer({
      storageKey: sourceFile.storageKey as string,
      startMs,
      endMs,
    });

    const context: SegmentContext = {
      segmentId,
      speakerId: segment.speakerId,
      userId: segment.speaker.userId,
      projectId: segment.session.projectId,
      startTime: segment.startTime,
      endTime: segment.endTime,
    };

    return { audioBuffer, context } satisfies ExtractSegmentResult;
  });

/**
 * Upload an audio buffer to R2 and create file + clip DB records.
 * Used after processing (denoising, etc.) to persist the result.
 */
const createClipFromBuffer = (params: {
  audioBuffer: Buffer;
  context: SegmentContext;
  contentType: string;
  extension: string;
}) =>
  Effect.gen(function* () {
    const { audioBuffer, context, contentType, extension } = params;
    const db = yield* Database;

    // Generate storage key for clip
    const clipStorageKey = `clips/${context.userId}/${context.segmentId}.${extension}`;

    console.log(
      `[createClipFromBuffer] Uploading clip for segment ${context.segmentId}: ${clipStorageKey}`,
    );

    // Upload buffer to R2
    yield* StorageService.uploadBuffer({
      key: clipStorageKey,
      data: audioBuffer,
      contentType,
    });

    // Calculate duration
    const durationSeconds = context.endTime - context.startTime;

    // Create file record
    const [newClipFile] = yield* db
      .insert(files)
      .values({
        userId: context.userId,
        projectId: context.projectId,
        storageKey: clipStorageKey,
        name: `clip-${context.segmentId.slice(0, 8)}.${extension}`,
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
        segmentId: context.segmentId,
        fileId: newClipFile.id,
      })
      .returning();

    if (!newClip) {
      return yield* Effect.fail(
        new Error(
          `Failed to create clip record for segment ${context.segmentId}`,
        ),
      );
    }

    console.log(
      `[createClipFromBuffer] Created clip for segment ${context.segmentId}: ${clipStorageKey}`,
    );

    return {
      segmentId: context.segmentId,
      speakerId: context.speakerId,
      clip: {
        id: newClip.id,
        segmentId: context.segmentId,
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

/**
 * Ensures a clip exists for the given segment.
 * If no clip exists, extracts audio from the source file and creates one.
 * Also scores the source audio and stores in segment.scores.
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

    // Score the source audio and store in segments.scores
    // This represents the quality of the original audio before any processing
    console.log(
      `[ensureClipExists] Scoring source audio for segment ${segmentId}`,
    );
    const sourceScores = yield* callScoringServer(audioBuffer).pipe(
      Effect.catchAll((error) => {
        console.warn(
          `[ensureClipExists] Failed to score source audio: ${error.message}`,
        );
        return Effect.succeed(null);
      }),
    );

    if (sourceScores) {
      yield* Effect.catchAll(
        db
          .update(segments)
          .set({ scores: { DNSMOS: sourceScores.DNSMOS } })
          .where(eq(segments.id, segmentId)),
        (error) => {
          console.error(
            `[ensureClipExists] Failed to save source scores:`,
            error,
          );
          return Effect.fail(error);
        },
      );
      console.log(
        `[ensureClipExists] Source scores saved for segment ${segmentId}:`,
        sourceScores.DNSMOS,
      );
    }

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
 *
 * Flow:
 * 1. Check if clip already exists → return early if so
 * 2. Extract raw audio from source file (no R2 upload yet)
 * 3. Score source audio → save to segment.scores
 * 4. Denoise audio via speech processing server
 * 5. Upload denoised audio to R2 and create clip records
 * 6. Return result (auto-triggers scoring of processed clip)
 */
const handleDenoise: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  console.log(`[Denoise] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;

      // Check if clip already exists
      const existingSegment = yield* db.query.segments.findFirst({
        where: eq(segments.id, segmentId),
        with: {
          clip: {
            with: {
              file: true,
            },
          },
          speaker: true,
        },
      });

      if (!existingSegment) {
        return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
      }

      // Return early if clip already exists
      if (existingSegment.clip?.file?.storageKey) {
        console.log(
          `[Denoise] Clip already exists for segment ${segmentId}, skipping`,
        );
        return {
          segmentId,
          speakerId: existingSegment.speakerId,
          clip: {
            id: existingSegment.clip.id,
            segmentId,
            fileId: existingSegment.clip.fileId,
            createdAt: existingSegment.clip.createdAt.toISOString(),
            file: {
              id: existingSegment.clip.file.id,
              storageKey: existingSegment.clip.file.storageKey,
              duration: existingSegment.clip.file.duration ?? 0,
            },
          },
        } satisfies ClipJobResult;
      }

      // Extract raw audio from source file
      console.log(`[Denoise] Extracting audio for segment ${segmentId}`);
      const { audioBuffer, context } = yield* extractSegmentAudio(segmentId);
      console.log(
        `[Denoise] Extracted ${audioBuffer.length} bytes from source`,
      );

      // Score source audio and save to segment.scores
      console.log(`[Denoise] Scoring source audio for segment ${segmentId}`);
      const sourceScores = yield* callScoringServer(audioBuffer).pipe(
        Effect.catchAll((error) => {
          console.warn(
            `[Denoise] Failed to score source audio: ${error.message}`,
          );
          return Effect.succeed(null);
        }),
      );

      if (sourceScores) {
        yield* db
          .update(segments)
          .set({ scores: { DNSMOS: sourceScores.DNSMOS } })
          .where(eq(segments.id, segmentId))
          .pipe(
            Effect.catchAll((error) => {
              console.error(`[Denoise] Failed to save source scores:`, error);
              return Effect.void;
            }),
          );
        console.log(
          `[Denoise] Source scores saved: OVRL=${sourceScores.DNSMOS.OVRL.toFixed(2)}`,
        );
      }

      // Denoise audio via speech processing server
      console.log(`[Denoise] Denoising audio for segment ${segmentId}`);
      const denoisedBuffer = yield* callDenoiseServer(audioBuffer);
      console.log(
        `[Denoise] Denoised audio: ${denoisedBuffer.length} bytes (FLAC 48kHz)`,
      );

      // Upload denoised audio to R2 and create clip records
      const result = yield* createClipFromBuffer({
        audioBuffer: denoisedBuffer,
        context,
        contentType: "audio/flac",
        extension: "flac",
      });

      console.log(`[Denoise] Clip created: ${result.clip.file.storageKey}`);

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

/** DNSMOS score response from scoring server */
interface DNSMOSResponse {
  DNSMOS: {
    SIG: number;
    BAK: number;
    OVRL: number;
    P808_MOS: number;
  };
}

/**
 * Call the speech scoring server to calculate DNSMOS scores.
 */
const callScoringServer = (audioBuffer: Buffer) =>
  Effect.tryPromise({
    try: async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([new Uint8Array(audioBuffer)], { type: "audio/flac" }),
        "audio.flac",
      );

      const response = await fetch(`${speechProcessingServerUrl}/score`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Scoring server error: ${response.status} - ${text}`);
      }

      return (await response.json()) as DNSMOSResponse;
    },
    catch: (error) =>
      new Error(
        `Failed to call scoring server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Call the speech processing server to denoise audio.
 * Returns the denoised audio as a FLAC buffer (48kHz).
 */
const callDenoiseServer = (audioBuffer: Buffer) =>
  Effect.tryPromise({
    try: async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([new Uint8Array(audioBuffer)], { type: "audio/flac" }),
        "audio.flac",
      );

      const response = await fetch(`${speechProcessingServerUrl}/denoise`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Denoise server error: ${response.status} - ${text}`);
      }

      return Buffer.from(await response.arrayBuffer());
    },
    catch: (error) =>
      new Error(
        `Failed to call denoise server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Fetch audio buffer from media server.
 */
const fetchAudioBuffer = (storageKey: string) =>
  Effect.tryPromise({
    try: async () => {
      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(storageKey)}`;
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
        `Failed to fetch from media server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Calculate DNSMOS quality scores for a segment's audio.
 * entryId = segmentId
 *
 * Fetches the clip audio from media server, sends to speech scoring server,
 * and updates DB with scores.
 */
const handleCalculateScore: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  console.log(`[CalculateScore] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;

      // Ensure clip exists (creates if needed)
      const result = yield* ensureClipExists(segmentId);
      console.log(
        `[CalculateScore] Clip ready: ${result.clip.file.storageKey}`,
      );

      // Fetch audio from media server
      const audioBuffer = yield* fetchAudioBuffer(result.clip.file.storageKey);
      console.log(
        `[CalculateScore] Fetched ${audioBuffer.length} bytes from media server`,
      );

      // Call scoring server
      const scores = yield* callScoringServer(audioBuffer);
      console.log(`[CalculateScore] Scores received:`, scores.DNSMOS);

      // Update clip scores only (segment source scores are set in ensureClipExists)
      yield* Effect.catchAll(
        db
          .update(clips)
          .set({ scores: { DNSMOS: scores.DNSMOS } })
          .where(eq(clips.segmentId, segmentId)),
        (error) => {
          console.error(`[CalculateScore] Failed to save clip scores:`, error);
          return Effect.fail(error);
        },
      );

      console.log(
        `[CalculateScore] Clip scores saved for segment ${segmentId}`,
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
  [AudioJobs.CalculateScore]: handleCalculateScore,
};

// ============================================================================
// Worker Setup
// ============================================================================

const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Queue instance for enqueuing follow-up jobs (e.g., scoring after processing)
const audioQueue = new Queue<AudioJobPayload>(Queues.AudioProcessing, {
  connection,
});

// Processing jobs that should trigger automatic scoring on completion
const PROCESSING_JOBS: AudioJobName[] = [
  AudioJobs.Denoise,
  AudioJobs.RemoveOverlap,
  AudioJobs.Transcribe,
];

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

worker.on("completed", async (job) => {
  console.log(`[AudioWorker] Job ${job.id} (${job.name}) completed`);

  // Auto-enqueue scoring after processing jobs complete
  if (PROCESSING_JOBS.includes(job.name as AudioJobName)) {
    const result = job.returnvalue as ClipJobResult | undefined;
    if (result?.segmentId) {
      try {
        await audioQueue.add(AudioJobs.CalculateScore, {
          entryId: result.segmentId,
        });
        console.log(
          `[AudioWorker] Enqueued scoring for segment ${result.segmentId}`,
        );
      } catch (error) {
        console.error(
          `[AudioWorker] Failed to enqueue scoring for segment ${result.segmentId}:`,
          error,
        );
      }
    }
  }
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
  await audioQueue.close();
  await connection.quit();
  await disposeRuntime();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

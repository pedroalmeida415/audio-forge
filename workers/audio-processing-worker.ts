import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import archiver from "archiver";
import { type Job, Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import IORedis from "ioredis";

import { env } from "../src/env";
import { isVideoMimeType } from "../src/lib/video-types";
import { clips, segments, sources, speakers } from "../src/server/db/schema";
import { AppRuntime, disposeRuntime } from "../src/services";
import { AudioProcessingService } from "../src/services/audio/audio-processing-service";
import { PyannoteService } from "../src/services/diarization/pyannote-service";
import { Database } from "../src/services/infra/database";
import {
  type AudioJobName,
  type AudioJobPayload,
  AudioJobs,
  type LJSpeechExportPayload,
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
 * Fetch a FLAC slice from the media server.
 * The media server extracts the slice using FFmpeg and returns it as a buffer.
 * Used for creating clips without needing to download the full source file.
 */
const fetchSliceFromMediaServer = (params: {
  storageKey: string;
  start: number;
  end: number;
}) =>
  Effect.tryPromise({
    try: async () => {
      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(params.storageKey)}&start=${params.start}&end=${params.end}&format=flac`;
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

/** Result returned from LJSpeech export jobs */
export interface LJSpeechExportResult {
  downloadUrl: string;
  fileCount: number;
  totalDuration: number;
  skippedCount: number;
}

type ExportJobHandler = (
  job: Job<LJSpeechExportPayload>,
) => Promise<LJSpeechExportResult>;

type HandlerRegistry = {
  [K in AudioJobName]?: JobHandler;
};

/** Clip data returned from ensureClipExists for SSE notifications */
interface ClipData {
  id: string;
  segmentId: string;
  userId: string;
  storageKey: string;
  duration: number;
  createdAt: string;
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

    // Look up segment with source relation (no clip needed)
    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: {
        source: true,
        speaker: true,
      },
    });

    if (!segment) {
      return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
    }

    const sourceStorageKey = segment.source.storageKey;
    if (!sourceStorageKey) {
      return yield* Effect.fail(
        new Error(`Source file not found for segment ${segmentId}`),
      );
    }

    console.log(
      `[extractSegmentAudio] Extracting audio for segment ${segmentId} (${segment.startTime}s - ${segment.endTime}s)`,
    );

    // Fetch slice from media server
    const audioBuffer = yield* fetchSliceFromMediaServer({
      storageKey: sourceStorageKey,
      start: segment.startTime,
      end: segment.endTime,
    });

    const context: SegmentContext = {
      segmentId,
      speakerId: segment.speakerId,
      userId: segment.speaker.userId,
      startTime: segment.startTime,
      endTime: segment.endTime,
    };

    return { audioBuffer, context } satisfies ExtractSegmentResult;
  });

/**
 * Upload an audio buffer to R2 and create a clip DB record.
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
    yield* StorageService.upload({
      key: clipStorageKey,
      body: audioBuffer,
      contentType,
    });

    // Calculate duration
    const durationSeconds = context.endTime - context.startTime;

    // Create clip record (self-contained with storageKey and duration)
    const [newClip] = yield* db
      .insert(clips)
      .values({
        segmentId: context.segmentId,
        userId: context.userId,
        storageKey: clipStorageKey,
        duration: durationSeconds,
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
        userId: context.userId,
        storageKey: clipStorageKey,
        duration: durationSeconds,
        createdAt: newClip.createdAt.toISOString(),
      },
    } satisfies EnsureClipResult;
  });

/**
 * Ensures a clip exists for the given segment.
 * If no clip exists, extracts audio from the source file and creates one.
 * Also scores the source audio and stores in segment.scores.
 * Returns the clip info for further processing.
 */
const ensureClipExists = (segmentId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;

    // Look up segment with clip and source relations
    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: {
        clip: true,
        source: true,
        speaker: true,
      },
    });

    if (!segment) {
      return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
    }

    // If clip already exists, return its info
    if (segment.clip?.storageKey) {
      return {
        segmentId,
        speakerId: segment.speakerId,
        clip: {
          id: segment.clip.id,
          segmentId,
          userId: segment.clip.userId,
          storageKey: segment.clip.storageKey,
          duration: segment.clip.duration,
          createdAt: segment.clip.createdAt.toISOString(),
        },
      } satisfies EnsureClipResult;
    }

    // No clip exists - need to create one
    const sourceStorageKey = segment.source.storageKey;
    if (!sourceStorageKey) {
      return yield* Effect.fail(
        new Error(`Source file not found for segment ${segmentId}`),
      );
    }

    console.log(
      `[ensureClipExists] Creating clip for segment ${segmentId} (${segment.startTime}s - ${segment.endTime}s)`,
    );

    // Fetch slice directly from media server (no need for temp files)
    const audioBuffer = yield* fetchSliceFromMediaServer({
      storageKey: sourceStorageKey,
      start: segment.startTime,
      end: segment.endTime,
    });

    // Generate storage key for clip
    const clipStorageKey = `clips/${segment.speaker.userId}/${segmentId}.flac`;

    // Upload buffer to R2
    yield* StorageService.upload({
      key: clipStorageKey,
      body: audioBuffer,
      contentType: "audio/flac",
    });

    // Calculate duration
    const durationSeconds = segment.endTime - segment.startTime;

    // Create clip record (self-contained)
    const [newClip] = yield* db
      .insert(clips)
      .values({
        segmentId,
        userId: segment.speaker.userId,
        storageKey: clipStorageKey,
        duration: durationSeconds,
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
        userId: segment.speaker.userId,
        storageKey: clipStorageKey,
        duration: durationSeconds,
        createdAt: newClip.createdAt.toISOString(),
      },
    } satisfies EnsureClipResult;
  });

// ============================================================================
// Job Handlers
// ============================================================================

function isFlacInput(params: {
  contentType: string | null;
  filename: string | null;
}) {
  const mime = params.contentType?.toLowerCase() ?? "";
  if (mime === "audio/flac" || mime === "audio/x-flac") {
    return true;
  }

  const name = params.filename?.toLowerCase() ?? "";
  return name.endsWith(".flac");
}

function toFlacName(filename: string | null, sourceId: string): string {
  if (!filename) {
    return `${sourceId}.flac`;
  }
  const trimmed = basename(filename).trim();
  if (!trimmed) {
    return `${sourceId}.flac`;
  }
  const withoutExtension = trimmed.replace(/\.[^/.]+$/, "");
  return `${withoutExtension}.flac`;
}

/**
 * Async source ingest pipeline.
 * entryId = sourceId
 *
 * Flow:
 * 1. Load staged upload from shared local filesystem
 * 2. Normalize to FLAC (reuse FLAC input, extract from video, convert audio)
 * 3. Upload final FLAC to R2 and persist storage metadata
 * 4. Generate waveform and store bytes directly in Postgres
 * 5. Mark source ingest+waveform completed
 * 6. Optionally queue diarization if requested by upload flow
 */
const handleIngestSource: JobHandler = async (job) => {
  const sourceId = job.data.entryId;
  const shouldQueueDiarization = job.data.queueDiarization === true;
  console.log(`[IngestSource] Processing source ${sourceId}`);

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      const source = yield* db.query.sources.findFirst({
        where: eq(sources.id, sourceId),
      });

      if (!source) {
        return yield* Effect.fail(new Error(`Source ${sourceId} not found`));
      }

      const stagedPath = source.ingestLocalPath;
      if (!stagedPath) {
        return yield* Effect.fail(
          new Error(`Source ${sourceId} has no staged file path`),
        );
      }
      console.log(`[IngestSource] Using staged path: ${stagedPath}`);

      yield* db
        .update(sources)
        .set({
          ingestStatus: "processing",
          ingestError: null,
          waveformStatus: "processing",
          waveformError: null,
        })
        .where(eq(sources.id, sourceId));

      const ingestContentType = source.ingestContentType ?? "";
      const ingestFilename =
        source.ingestOriginalFilename ??
        source.originalFileName ??
        source.name ??
        "source";

      const stagedDir = dirname(stagedPath);
      const normalizedFlacPath = join(stagedDir, `${sourceId}.flac`);
      const waveformPath = join(stagedDir, `${sourceId}.dat`);

      // Clear stale intermediates from previous attempts so retries don't block.
      yield* Effect.sync(() => {
        if (normalizedFlacPath !== stagedPath) {
          rmSync(normalizedFlacPath, { force: true });
        }
        rmSync(waveformPath, { force: true });
      });

      let flacPath = stagedPath;
      let duration = 0;
      let createdNormalizedFlac = false;

      if (
        isFlacInput({
          contentType: ingestContentType,
          filename: ingestFilename,
        })
      ) {
        console.log(`[IngestSource] FLAC passthrough for ${sourceId}`);
        const metadata = yield* AudioProcessingService.probe({
          inputPath: stagedPath,
        });
        if (!metadata.hasAudio) {
          return yield* Effect.fail(
            new Error(`Staged FLAC has no audio for source ${sourceId}`),
          );
        }
        duration = metadata.durationSeconds;
      } else if (isVideoMimeType(ingestContentType)) {
        console.log(`[IngestSource] Extracting video audio for ${sourceId}`);
        const extracted = yield* AudioProcessingService.extractFromVideo({
          inputPath: stagedPath,
          outputPath: normalizedFlacPath,
        });
        flacPath = extracted.outputPath;
        duration = extracted.durationSeconds;
        createdNormalizedFlac = true;
      } else if (ingestContentType.startsWith("audio/")) {
        console.log(`[IngestSource] Converting audio to FLAC for ${sourceId}`);
        const converted = yield* AudioProcessingService.convertToFlac({
          inputPath: stagedPath,
          outputPath: normalizedFlacPath,
        });
        flacPath = converted.outputPath;
        duration = converted.durationSeconds;
        createdNormalizedFlac = true;
      } else {
        return yield* Effect.fail(
          new Error(`Unsupported ingest content type: ${ingestContentType}`),
        );
      }

      if (!Number.isFinite(duration) || duration <= 0) {
        const metadata = yield* AudioProcessingService.probe({
          inputPath: flacPath,
        });
        duration = metadata.durationSeconds;
      }

      const audioStorageKey = `sources/${source.userId}/${Date.now()}-${sourceId}.flac`;
      console.log(`[IngestSource] Uploading FLAC to R2 for ${sourceId}`);
      const flacStats = statSync(flacPath);
      yield* StorageService.upload({
        key: audioStorageKey,
        body: createReadStream(flacPath),
        contentType: "audio/flac",
        contentLength: flacStats.size,
      });

      console.log(`[IngestSource] Generating waveform for ${sourceId}`);
      yield* AudioProcessingService.generateWaveform({
        inputPath: flacPath,
        outputPath: waveformPath,
        samplesPerPixel: 256,
      });

      const waveformBuffer = yield* Effect.try({
        try: () => readFileSync(waveformPath),
        catch: (error) =>
          new Error(
            `Failed to read generated waveform for source ${sourceId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
      });

      const displayName = toFlacName(ingestFilename, sourceId);

      const update: Partial<typeof sources.$inferInsert> = {
        storageKey: audioStorageKey,
        duration,
        name: displayName,
        originalFileName: ingestFilename,
        ingestStatus: "completed",
        ingestError: null,
        ingestLocalPath: null,
        waveformStatus: "completed",
        waveformError: null,
        waveformData: waveformBuffer,
      };

      if (shouldQueueDiarization) {
        console.log(`[IngestSource] Auto-queueing diarization for ${sourceId}`);

        const diarizationUpdate = yield* Effect.gen(function* () {
          const { url: audioUrl } = yield* StorageService.generatePresignedUrl({
            key: audioStorageKey,
            operation: "download",
            expiresIn: 7200,
          });

          const diarizationJob = yield* PyannoteService.submitJob({
            audioUrl,
          }).pipe(
            Effect.catchTag("PyannoteError", (error) =>
              Effect.fail(new Error(error.message)),
            ),
          );

          console.log(
            `[IngestSource] Auto-diarization queued for ${sourceId}: ${diarizationJob.jobId}`,
          );

          return {
            diarizationJobId: diarizationJob.jobId,
            diarizationStatus: "pending" as const,
            diarizationStartedAt: new Date(),
            diarizationCompletedAt: null,
            diarizationError: null,
          };
        }).pipe(
          Effect.catchAll((error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to queue diarization";

            console.error(
              `[IngestSource] Auto-diarization failed for ${sourceId}:`,
              message,
            );

            return Effect.succeed({
              diarizationJobId: null,
              diarizationStatus: "failed" as const,
              diarizationStartedAt: null,
              diarizationCompletedAt: new Date(),
              diarizationError: message,
            });
          }),
        );

        Object.assign(update, diarizationUpdate);
      }

      yield* db.update(sources).set(update).where(eq(sources.id, sourceId));

      // Delete staged artifacts only after full success.
      yield* Effect.sync(() => {
        rmSync(waveformPath, { force: true });
        rmSync(stagedPath, { force: true });
        if (createdNormalizedFlac) {
          rmSync(flacPath, { force: true });
        }
      });

      console.log(`[IngestSource] Source ${sourceId} completed`);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const db = yield* Database;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown ingest error";

          console.error(
            `[IngestSource] Source ${sourceId} failed:`,
            errorMessage,
          );

          yield* db
            .update(sources)
            .set({
              ingestStatus: "failed",
              ingestError: errorMessage,
              waveformStatus: "failed",
              waveformError: errorMessage,
            })
            .where(eq(sources.id, sourceId))
            .pipe(Effect.catchAll(() => Effect.void));

          return yield* Effect.fail(error);
        }),
      ),
    ),
  );

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
 * 5. Upload denoised audio to R2 and create clip record
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
          clip: true,
          speaker: true,
        },
      });

      if (!existingSegment) {
        return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
      }

      // Return early if clip already exists
      if (existingSegment.clip?.storageKey) {
        console.log(
          `[Denoise] Clip already exists for segment ${segmentId}, skipping`,
        );
        return {
          segmentId,
          speakerId: existingSegment.speakerId,
          clip: {
            id: existingSegment.clip.id,
            segmentId,
            userId: existingSegment.clip.userId,
            storageKey: existingSegment.clip.storageKey,
            duration: existingSegment.clip.duration,
            createdAt: existingSegment.clip.createdAt.toISOString(),
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

      // Upload denoised audio to R2 and create clip record
      const result = yield* createClipFromBuffer({
        audioBuffer: denoisedBuffer,
        context,
        contentType: "audio/flac",
        extension: "flac",
      });

      console.log(`[Denoise] Clip created: ${result.clip.storageKey}`);

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
      console.log(`[RemoveOverlap] Clip ready: ${result.clip.storageKey}`);

      // TODO: Implement overlap removal
      // 1. Download audio from result.clip.storageKey
      // 2. Detect and remove overlapping speech regions
      // 3. Upload processed audio (update clip or create new version)
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
      console.log(`[Transcribe] Clip ready: ${result.clip.storageKey}`);

      // TODO: Implement transcription
      // 1. Download audio from result.clip.storageKey
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
      console.log(`[CalculateScore] Clip ready: ${result.clip.storageKey}`);

      // Fetch audio from media server
      const audioBuffer = yield* fetchAudioBuffer(result.clip.storageKey);
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

/**
 * Export segments as LJSpeech dataset (ZIP with WAV files + metadata.csv).
 *
 * Flow:
 * 1. Fetch all segments for speaker with clips and transcriptions
 * 2. Filter to segments with both clip AND transcription
 * 3. For each exportable segment:
 *    - Fetch clip audio from media server
 *    - Convert to WAV at specified sample rate (mono, 16-bit PCM)
 *    - Add to metadata.csv
 * 4. Create ZIP archive
 * 5. Upload to R2 and generate presigned download URL
 */
const handleLJSpeechExport: ExportJobHandler = async (job) => {
  const { speakerId, userId, sampleRate } = job.data;
  console.log(
    `[LJSpeechExport] Starting export for speaker ${speakerId} at ${sampleRate}Hz`,
  );

  return await AppRuntime.runPromise(
    Effect.acquireUseRelease(
      // Acquire: Create temp directory
      Effect.sync(() => {
        const tempDir = mkdtempSync(join(tmpdir(), `ljspeech-${speakerId}-`));
        const wavsDir = join(tempDir, "wavs");
        require("node:fs").mkdirSync(wavsDir);
        console.log(`[LJSpeechExport] Created temp directory: ${tempDir}`);
        return { tempDir, wavsDir };
      }),

      // Use: Process export
      ({ tempDir, wavsDir }) =>
        Effect.gen(function* () {
          const db = yield* Database;

          // Fetch all segments for speaker with clips and transcriptions
          const segmentResults = yield* db.query.segments.findMany({
            where: eq(segments.speakerId, speakerId),
            with: {
              clip: true,
            },
            orderBy: (segments, { asc }) => [asc(segments.startTime)],
          });

          // Filter to only segments with both clip AND transcription
          type ExportableSegment = (typeof segmentResults)[number] & {
            clip: NonNullable<(typeof segmentResults)[number]["clip"]> & {
              storageKey: string;
            };
            transcription: string;
          };

          const exportableSegments = segmentResults.filter(
            (s): s is ExportableSegment =>
              s.clip?.storageKey != null &&
              s.transcription != null &&
              s.transcription.trim().length > 0,
          );

          const skippedCount =
            segmentResults.length - exportableSegments.length;
          console.log(
            `[LJSpeechExport] Found ${exportableSegments.length} exportable segments (${skippedCount} skipped)`,
          );

          if (exportableSegments.length === 0) {
            return yield* Effect.fail(
              new Error(
                "No segments with both clips and transcriptions found for export",
              ),
            );
          }

          // Get speaker prefix for filenames
          const speaker = yield* db.query.speakers.findFirst({
            where: eq(speakers.id, speakerId),
          });
          const speakerPrefix =
            speaker?.name
              .replace(/[^a-zA-Z0-9]/g, "_")
              .toLowerCase()
              .slice(0, 20) ?? speakerId.slice(0, 8);

          const metadataLines: string[] = [];
          let totalDuration = 0;

          // Process each segment
          for (const [i, segment] of exportableSegments.entries()) {
            const clipStorageKey = segment.clip.storageKey;
            const transcription = segment.transcription.trim();

            // Report progress
            yield* Effect.promise(() =>
              job.updateProgress({
                type: "export",
                processed: i,
                total: exportableSegments.length,
              }),
            );

            // Generate filename (1-indexed, zero-padded)
            const index = String(i + 1).padStart(5, "0");
            const filename = `${speakerPrefix}_${index}`;
            const wavPath = join(wavsDir, `${filename}.wav`);

            // Fetch audio from media server
            const audioBuffer = yield* fetchAudioBuffer(clipStorageKey);

            // Write to temp file for ffmpeg input
            const inputPath = join(tempDir, `input_${index}.flac`);
            writeFileSync(inputPath, audioBuffer);

            // Convert to WAV: mono, 16-bit PCM, specified sample rate
            yield* AudioProcessingService.convertToWav({
              inputPath,
              outputPath: wavPath,
              sampleRate,
              channels: 1,
              bitDepth: 16,
            });

            // Clean up input file
            rmSync(inputPath);

            // Add to metadata (filename|transcription)
            metadataLines.push(`${filename}|${transcription}`);
            totalDuration += segment.endTime - segment.startTime;

            console.log(
              `[LJSpeechExport] Processed ${i + 1}/${exportableSegments.length}: ${filename}`,
            );
          }

          // Write metadata.csv (no header, pipe-delimited)
          const metadataPath = join(tempDir, "metadata.csv");
          writeFileSync(metadataPath, metadataLines.join("\n"));

          // Create ZIP archive using archiver
          const zipPath = join(tempDir, "dataset.zip");
          yield* Effect.async<void, Error>((resume) => {
            const output = createWriteStream(zipPath);
            const archive = archiver("zip", { zlib: { level: 9 } });

            output.on("close", () => {
              resume(Effect.succeed(undefined));
            });

            archive.on("error", (err) => {
              resume(
                Effect.fail(new Error(`Failed to create ZIP: ${err.message}`)),
              );
            });

            archive.pipe(output);

            // Add wavs directory
            archive.directory(wavsDir, "wavs");

            // Add metadata.csv
            archive.file(metadataPath, { name: "metadata.csv" });

            archive.finalize();
          });

          console.log(`[LJSpeechExport] Created ZIP archive: ${zipPath}`);

          // Upload to R2
          const timestamp = Date.now();
          const exportKey = `exports/${userId}/${timestamp}-${speakerId.slice(0, 8)}.zip`;

          const zipStats = statSync(zipPath);
          yield* StorageService.upload({
            key: exportKey,
            body: createReadStream(zipPath),
            contentType: "application/zip",
            contentLength: zipStats.size,
          });

          console.log(`[LJSpeechExport] Uploaded to R2: ${exportKey}`);

          // Generate presigned download URL (24h expiry)
          const { url: downloadUrl } =
            yield* StorageService.generatePresignedUrl({
              key: exportKey,
              operation: "download",
              expiresIn: 24 * 60 * 60, // 24 hours
            });

          console.log(
            `[LJSpeechExport] Export complete: ${exportableSegments.length} files, ${totalDuration.toFixed(1)}s total`,
          );

          return {
            downloadUrl,
            fileCount: exportableSegments.length,
            totalDuration,
            skippedCount,
          } satisfies LJSpeechExportResult;
        }),

      // Release: Cleanup temp directory
      ({ tempDir }) =>
        Effect.sync(() => {
          rmSync(tempDir, { recursive: true, force: true });
        }),
    ),
  );
};

// ============================================================================
// Handler Registry
// ============================================================================

const handlers: HandlerRegistry = {
  [AudioJobs.IngestSource]: handleIngestSource,
  [AudioJobs.Denoise]: handleDenoise,
  [AudioJobs.RemoveOverlap]: handleRemoveOverlap,
  [AudioJobs.Transcribe]: handleTranscribe,
  [AudioJobs.CalculateScore]: handleCalculateScore,
};

const exportHandlers: { [key: string]: ExportJobHandler } = {
  [AudioJobs.LJSpeechExport]: handleLJSpeechExport,
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

const worker = new Worker(
  Queues.AudioProcessing,
  async (job) => {
    const jobName = job.name as AudioJobName;

    // Check if it's an export job (different payload type)
    const exportHandler = exportHandlers[jobName];
    if (exportHandler) {
      return await exportHandler(job as Job<LJSpeechExportPayload>);
    }

    // Regular audio processing job
    const handler = handlers[jobName];
    if (!handler) {
      console.error(`[AudioWorker] Unknown job type: ${jobName}`);
      throw new Error(`Unknown job type: ${jobName}`);
    }

    return await handler(job as Job<AudioJobPayload>);
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

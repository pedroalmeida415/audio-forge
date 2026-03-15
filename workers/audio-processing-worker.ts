import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type Job, Queue, Worker } from "bullmq";
import { desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import IORedis from "ioredis";
import { env } from "../src/env";
import {
  clips,
  type DiarizationInfo,
  segments,
  sources,
  speakers,
} from "../src/server/db/schema";
import { AppRuntime } from "../src/services";
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

if (typeof Bun === "undefined") {
  console.error(
    "❌ Error: This worker relies on Bun-specific APIs and MUST be run with the Bun runtime.",
  );
  process.exit(1);
}

// ============================================================================
// Server Configuration
// ============================================================================

const mediaServerUrl = process.env.MEDIA_SERVER_URL ?? "http://localhost:3002";
const speechProcessingServerUrl =
  process.env.SPEECH_PROCESSING_SERVER_URL ?? "http://localhost:8000";

/**
 * Generate a presigned download URL for a storage key.
 * Short helper to reduce boilerplate in handlers.
 */
const generatePresignedDownloadUrl = (storageKey: string) =>
  StorageService.generatePresignedUrl({
    key: storageKey,
    operation: "download",
    expiresIn: 3600,
  }).pipe(
    Effect.map((result) => result.url),
    Effect.catchTag("StorageError", (error) =>
      Effect.fail(
        new Error(
          `Failed to generate presigned URL for ${storageKey}: ${error.message}`,
        ),
      ),
    ),
  );

/**
 * Fetch a FLAC slice from the media server.
 * Generates a presigned URL, passes it to the media server which extracts
 * the slice using FFmpeg and returns it as a buffer.
 */
const fetchSliceFromMediaServer = (params: {
  storageKey: string;
  start: number;
  end: number;
}) =>
  Effect.gen(function* () {
    const presignedUrl = yield* generatePresignedDownloadUrl(params.storageKey);
    const mediaUrl = buildMediaServerUrl({
      presignedUrl,
      start: params.start,
      end: params.end,
      format: "flac",
    });

    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(mediaUrl);
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
  segmentTags?: string[] | null;
}

/** Result returned from clip job handlers for SSE notifications */
export interface ClipJobResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
  segmentTags?: string[] | null;
}

/** Context needed to create a clip from an audio buffer */
interface SegmentContext {
  segmentId: string;
  speakerId: string;
  userId: string;
  startTime: number;
  endTime: number;
}

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

    // Generate storage key for clip (using timestamp to avoid media server caching)
    const clipStorageKey = `clips/${context.userId}/${context.segmentId}_${Date.now()}.${extension}`;

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
 * If no clip exists (or useExistingClip is false), extracts audio from the source file and creates one.
 * Returns the clip info for further processing.
 */
const ensureClipExists = (segmentId: string, useExistingClip?: boolean) =>
  Effect.gen(function* () {
    const db = yield* Database;

    // Look up segment with clips (latest first) and source relations
    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: {
        clips: {
          orderBy: [desc(clips.createdAt)],
          limit: 1,
        },
        source: true,
        speaker: true,
      },
    });

    if (!segment) {
      return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
    }

    const latestClip = segment.clips[0];

    // If a clip exists and we want to reuse it (or no preference), return it
    if (useExistingClip !== false && latestClip?.storageKey) {
      console.log(
        `[ensureClipExists] Found existing clip for segment ${segmentId}: ${latestClip.storageKey}`,
      );
      return {
        segmentId,
        speakerId: segment.speakerId,
        clip: {
          id: latestClip.id,
          segmentId,
          userId: latestClip.userId,
          storageKey: latestClip.storageKey,
          duration: latestClip.duration,
          createdAt: latestClip.createdAt.toISOString(),
        },
      } satisfies EnsureClipResult;
    }

    // Need to create one (either it didn't exist or we are explicitly overriding it)
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

    // Generate storage key for clip (using timestamp to avoid media server caching the old slice)
    const clipStorageKey = `clips/${segment.speaker.userId}/${segmentId}_${Date.now()}.flac`;

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

    // Remove 'Outdated Clip' tag if it exists, as the new clip is in sync with segment bounds
    yield* db
      .update(segments)
      .set({
        tags: sql`array_remove(${segments.tags}, 'Outdated Clip')`,
      })
      .where(eq(segments.id, segmentId));

    console.log(
      `[ensureClipExists] Created clip for segment ${segmentId}: ${clipStorageKey}`,
    );

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

  let tempDirToClean: string | null = null;

  try {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const source = yield* db.query.sources.findFirst({
          where: eq(sources.id, sourceId),
        });

        if (!source) {
          return yield* Effect.fail(new Error(`Source ${sourceId} not found`));
        }

        const rawStorageKey = source.storageKey;
        if (!rawStorageKey) {
          return yield* Effect.fail(
            new Error(`Source ${sourceId} has no storage key`),
          );
        }

        const stagedDir = mkdtempSync(
          join(tmpdir(), `audio-forge-ingest-${sourceId}-`),
        );
        tempDirToClean = stagedDir;
        const stagedPath = join(stagedDir, "raw-upload");
        const normalizedFlacPath = join(stagedDir, `${sourceId}.flac`);
        const waveformPath = join(stagedDir, `${sourceId}.dat`);

        console.log(`[IngestSource] Downloading raw upload: ${rawStorageKey}`);
        const { url: downloadUrl } = yield* StorageService.generatePresignedUrl(
          {
            key: rawStorageKey,
            operation: "download",
            expiresIn: 3600,
          },
        );

        yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch(downloadUrl);
            if (!response.ok) {
              throw new Error(`R2 download failed: ${response.statusText}`);
            }
            if (!response.body) {
              throw new Error("R2 response has no body");
            }
            // Bun.write(path, response) hangs for large remote responses (known Bun bug https://github.com/oven-sh/bun/issues/13237).
            // Stream through Bun.file().writer() to avoid the hang without buffering.
            const writer = Bun.file(stagedPath).writer();
            for await (const chunk of response.body) {
              writer.write(chunk);
            }
            await writer.end();
          },
          catch: (error) =>
            new Error(`Failed to download raw upload: ${error}`),
        });

        // We no longer have ingestContentType, let's use originalFileName to guess format
        const ingestFilename =
          source.originalFileName ?? source.name ?? "source";

        let flacPath = stagedPath;
        let duration = 0;

        // For simplicity, just probe the downloaded file using AudioProcessingService
        console.log(`[IngestSource] Probing file for ${sourceId}`);
        const metadata = yield* AudioProcessingService.probe({
          inputPath: stagedPath,
        });

        if (!metadata.hasAudio) {
          return yield* Effect.fail(
            new Error(`Staged file has no audio for source ${sourceId}`),
          );
        } // Wait, we can convert all formats to FLAC securely without an explicit switch

        console.log(`[IngestSource] Converting audio to FLAC for ${sourceId}`);
        const converted = yield* AudioProcessingService.convertToFlac({
          inputPath: stagedPath,
          outputPath: normalizedFlacPath,
        });
        flacPath = converted.outputPath;
        duration = converted.durationSeconds;
        if (!Number.isFinite(duration) || duration <= 0) {
          const metadata = yield* AudioProcessingService.probe({
            inputPath: flacPath,
          });
          duration = metadata.durationSeconds;
        }

        const audioStorageKey = `sources/${source.userId}/${Date.now()}-${sourceId}.flac`;
        console.log(`[IngestSource] Uploading FLAC to R2 for ${sourceId}`);
        const flacFile = Bun.file(flacPath);
        yield* StorageService.upload({
          key: audioStorageKey,
          body: flacFile,
          contentType: "audio/flac",
          contentLength: flacFile.size,
        });

        console.log(`[IngestSource] Generating waveform for ${sourceId}`);
        yield* AudioProcessingService.generateWaveform({
          inputPath: flacPath,
          outputPath: waveformPath,
          samplesPerPixel: 256,
        });

        const waveformBuffer = yield* Effect.tryPromise({
          try: async () => Buffer.from(await Bun.file(waveformPath).bytes()),
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
          status: "completed",
          error: null,
          waveformData: waveformBuffer,
        };

        if (shouldQueueDiarization) {
          console.log(
            `[IngestSource] Auto-queueing diarization for ${sourceId}`,
          );

          // Instead of submitting to Pyannote here,
          // enqueue a separate Diarize job that handles denoise + submission.
          yield* Effect.tryPromise({
            try: () =>
              audioQueue.add(AudioJobs.Diarize, {
                entryId: sourceId,
              }),
            catch: (error) => {
              console.error(
                `[IngestSource] Failed to enqueue diarize job for ${sourceId}:`,
                error,
              );
              return new Error(`Failed to enqueue diarize: ${error}`);
            },
          });
        }

        yield* db.update(sources).set(update).where(eq(sources.id, sourceId));
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
                status: "failed",
                error: errorMessage,
              })
              .where(eq(sources.id, sourceId))
              .pipe(Effect.catchAll(() => Effect.void));

            return yield* Effect.fail(error);
          }),
        ),
      ),
    );
  } finally {
    if (tempDirToClean) {
      try {
        rmSync(tempDirToClean, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to clean up staging directory: ${e}`);
      }
    }
  }

  return undefined;
};

/**
 * Diarize a source — optionally denoise first, then submit to Pyannote.
 * entryId = sourceId
 *
 * Reads `source.diarization.denoise` to decide whether to denoise.
 * Updates `source.diarization` JSONB throughout the process.
 */
const handleDiarize: JobHandler = async (job) => {
  const sourceId = job.data.entryId;
  console.log(`[Diarize] Starting for source ${sourceId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;

      // Fetch source record
      const source = yield* db.query.sources.findFirst({
        where: eq(sources.id, sourceId),
      });

      if (!source) {
        throw new Error(`Source ${sourceId} not found`);
      }

      if (!source.storageKey) {
        throw new Error(`Source ${sourceId} has no storage key`);
      }

      const shouldDenoise = source.diarization?.denoise === true;
      let audioUrl: string;

      if (shouldDenoise) {
        console.log(
          `[Diarize] Denoising source ${sourceId} before diarization`,
        );

        // Get source audio URL via media server
        const presignedUrl = yield* generatePresignedDownloadUrl(
          source.storageKey,
        );
        const mediaUrl = buildMediaServerUrl({
          presignedUrl,
          format: "flac",
        });

        // Call denoise server
        const denoiseBuffer = yield* callDenoiseServer(mediaUrl);

        // Upload denoised audio to temp bucket
        const tempKey = `denoised/${source.userId}/${Date.now()}-${sourceId}.flac`;
        yield* StorageService.upload({
          key: tempKey,
          body: denoiseBuffer,
          contentType: "audio/flac",
          bucket: env.CLOUDFLARE_R2_TEMP_BUCKET,
        });

        console.log(`[Diarize] Denoised audio uploaded to temp: ${tempKey}`);

        // Generate presigned URL from temp bucket for Pyannote
        const { url: denoisedUrl } = yield* StorageService.generatePresignedUrl(
          {
            key: tempKey,
            operation: "download",
            expiresIn: 7200,
            bucket: env.CLOUDFLARE_R2_TEMP_BUCKET,
          },
        );

        audioUrl = denoisedUrl;
      } else {
        const { url } = yield* StorageService.generatePresignedUrl({
          key: source.storageKey,
          operation: "download",
          expiresIn: 7200,
        });
        audioUrl = url;
      }

      // Submit to Pyannote
      const diarizationJob = yield* PyannoteService.submitJob({
        audioUrl,
      }).pipe(
        Effect.catchTag("PyannoteError", (error) =>
          Effect.fail(new Error(error.message)),
        ),
      );

      console.log(
        `[Diarize] Submitted to Pyannote for ${sourceId}: job ${diarizationJob.jobId}`,
      );

      // Update diarization JSONB with job info
      const updatedDiarization: DiarizationInfo = {
        ...source.diarization,
        status: "pending",
        jobId: diarizationJob.jobId,
        startedAt: source.diarization?.startedAt ?? new Date().toISOString(),
      };

      yield* db
        .update(sources)
        .set({ diarization: updatedDiarization })
        .where(eq(sources.id, sourceId));

      return undefined;
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const db = yield* Database;
          const message =
            error instanceof Error ? error.message : "Diarization failed";

          console.error(`[Diarize] Failed for source ${sourceId}:`, message);

          const failedDiarization: DiarizationInfo = {
            status: "failed",
            error: message,
            completedAt: new Date().toISOString(),
          };

          yield* db
            .update(sources)
            .set({ diarization: failedDiarization })
            .where(eq(sources.id, sourceId))
            .pipe(Effect.catchAll(() => Effect.void));

          return yield* Effect.fail(error);
        }),
      ),
    ),
  );
};

/**
 * Denoise a segment's audio.
 * entryId = segmentId
 *
 * Flow:
 * 1. Check if clip already exists → return early if so
 * 2. Extract raw audio from source file (no R2 upload yet)
 * 3. Denoise audio via speech processing server
 * 4. Upload denoised audio to R2 and create clip record
 * 5. Return result (auto-triggers scoring of processed clip)
 */
const handleDenoise: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  const useExistingClip = job.data.useExistingClip;

  console.log(`[Denoise] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;

      const existingSegment = yield* db.query.segments.findFirst({
        where: eq(segments.id, segmentId),
        with: {
          clips: {
            orderBy: [desc(clips.createdAt)],
            limit: 1,
          },
          source: true,
          speaker: true,
        },
      });

      if (!existingSegment) {
        return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
      }

      const latestClip = existingSegment.clips[0];

      let audioUrl: string;
      let context: SegmentContext;

      if (useExistingClip && latestClip?.storageKey) {
        // Use existing clip audio via media server URL
        console.log(`[Denoise] Using existing clip ${latestClip.storageKey}`);
        const presignedUrl = yield* generatePresignedDownloadUrl(
          latestClip.storageKey,
        );
        audioUrl = buildMediaServerUrl({
          presignedUrl,
          format: "flac",
        });
        context = {
          segmentId,
          speakerId: existingSegment.speakerId,
          userId: latestClip.userId,
          startTime: existingSegment.startTime,
          endTime: existingSegment.endTime,
        };
      } else {
        // Construct media server URL for the source file slice
        const sourceStorageKey = existingSegment.source.storageKey;
        if (!sourceStorageKey) {
          return yield* Effect.fail(
            new Error(`Source file not found for segment ${segmentId}`),
          );
        }
        console.log(`[Denoise] Using source slice for segment ${segmentId}`);
        const presignedUrl =
          yield* generatePresignedDownloadUrl(sourceStorageKey);
        audioUrl = buildMediaServerUrl({
          presignedUrl,
          start: existingSegment.startTime,
          end: existingSegment.endTime,
          format: "flac",
        });
        context = {
          segmentId,
          speakerId: existingSegment.speakerId,
          userId: existingSegment.speaker.userId,
          startTime: existingSegment.startTime,
          endTime: existingSegment.endTime,
        };
      }

      // Denoise audio via speech processing server (URL-based)
      console.log(`[Denoise] Denoising audio for segment ${segmentId}`);
      const denoisedBuffer = yield* callDenoiseServer(audioUrl);
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

      // Remove 'Outdated Clip' tag if it exists, as the new clip is in sync with segment bounds
      yield* db
        .update(segments)
        .set({
          tags: sql`array_remove(${segments.tags}, 'Outdated Clip')`,
        })
        .where(eq(segments.id, segmentId));

      console.log(`[Denoise] Clip created: ${result.clip.storageKey}`);

      return result satisfies ClipJobResult;
    }),
  );
};

/**
 * Transcribe a segment's audio.
 * entryId = segmentId
 * Ensures clip exists, then transcribes and saves to segment.
 */
const handleTranscribe: JobHandler = async (job) => {
  const segmentId = job.data.entryId;
  const useExistingClip = job.data.useExistingClip;

  console.log(`[Transcribe] Processing segment ${segmentId}`);

  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;

      // Ensure clip exists (creates if needed)
      const result = yield* ensureClipExists(segmentId, useExistingClip);
      console.log(`[Transcribe] Clip ready: ${result.clip.storageKey}`);

      // Generate presigned URL and construct media server URL for the clip
      const presignedUrl = yield* generatePresignedDownloadUrl(
        result.clip.storageKey,
      );
      const audioUrl = buildMediaServerUrl({
        presignedUrl,
        format: "flac",
      });

      // Call transcription server with URL
      const transcriptionResult = yield* callTranscriptionServer(audioUrl);
      console.log(
        `[Transcribe] Transcription received:`,
        transcriptionResult.text,
      );

      const existingSegment = yield* db.query.segments.findFirst({
        where: eq(segments.id, segmentId),
      });

      if (!existingSegment) {
        return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
      }

      // Update segment.transcription and remove tag
      const updateResult = yield* db
        .update(segments)
        .set({
          transcription: transcriptionResult.text,
          tags: sql`array_remove(${segments.tags}, 'Outdated Transcription')`,
        })
        .where(eq(segments.id, segmentId))
        .returning({ tags: segments.tags });

      const updatedSegment = Array.isArray(updateResult)
        ? updateResult[0]
        : undefined;

      console.log(`[Transcribe] Transcription saved for segment ${segmentId}`);

      return {
        ...result,
        segmentTags: updatedSegment?.tags ?? existingSegment.tags,
      } satisfies ClipJobResult;
    }),
  );
};

// ============================================================================
// Media Server URL Builder
// ============================================================================

/**
 * Build a media server URL for a given presigned URL.
 * The presigned URL is passed as the `url` query parameter.
 * Optionally includes start/end for time-sliced access and format.
 */
const buildMediaServerUrl = (params: {
  presignedUrl: string;
  start?: number;
  end?: number;
  format: string;
}): string => {
  const url = new URL(`${mediaServerUrl}/audio`);
  url.searchParams.set("url", params.presignedUrl);
  if (params.start != null) url.searchParams.set("start", String(params.start));
  if (params.end != null) url.searchParams.set("end", String(params.end));
  url.searchParams.set("format", params.format);
  return url.toString();
};

// ============================================================================
// Speech Processing Server Callers (URL-based)
// ============================================================================

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
 * Sends a URL that the scoring server will download from.
 */
const callScoringServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
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

/** transcription response from scoring server */
interface TranscriptionResponse {
  text: string;
}

/**
 * Call the speech processing server to transcribe audio.
 * Sends a URL that the transcription server will download from.
 */
const callTranscriptionServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Transcription server error: ${response.status} - ${text}`,
        );
      }

      return (await response.json()) as TranscriptionResponse;
    },
    catch: (error) =>
      new Error(
        `Failed to call transcription server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Call the speech processing server to denoise audio.
 * Sends a URL that the denoise server will download from.
 * Returns the denoised audio as a FLAC buffer (48kHz).
 */
const callDenoiseServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/denoise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
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
 * Download audio from media server directly to disk.
 * Generates a presigned URL for the storage key and passes it to the media server.
 */
const downloadAudioFile = (storageKey: string, outputPath: string) =>
  Effect.gen(function* () {
    const presignedUrl = yield* generatePresignedDownloadUrl(storageKey);
    const mediaUrl = buildMediaServerUrl({
      presignedUrl,
      format: "flac",
    });

    yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          throw new Error(
            `Media server error: ${response.status} ${response.statusText}`,
          );
        }
        await Bun.write(outputPath, response);
      },
      catch: (error) =>
        new Error(
          `Failed to download from media server: ${error instanceof Error ? error.message : String(error)}`,
        ),
    });
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

      // Generate presigned URL and construct media server URL for the clip
      const presignedUrl = yield* generatePresignedDownloadUrl(
        result.clip.storageKey,
      );
      const audioUrl = buildMediaServerUrl({
        presignedUrl,
        format: "flac",
      });

      // Call scoring server with URL
      const scores = yield* callScoringServer(audioUrl);
      console.log(`[CalculateScore] Scores received:`, scores.DNSMOS);

      // Update clip scores only
      yield* db
        .update(clips)
        .set({ scores: { DNSMOS: scores.DNSMOS } })
        .where(eq(clips.id, result.clip.id));

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
  const {
    speakerId,
    userId,
    sampleRate,
    minDuration,
    maxDuration,
    minScore,
    maxScore,
  } = job.data;
  console.log(
    `[LJSpeechExport] Starting export for speaker ${speakerId} at ${sampleRate}Hz (Filters: dur ${minDuration}-${maxDuration}, score ${minScore}-${maxScore})`,
  );

  return await AppRuntime.runPromise(
    Effect.acquireUseRelease(
      // Acquire: Create temp directory
      Effect.sync(() => {
        const tempDir = mkdtempSync(join(tmpdir(), `ljspeech-${speakerId}-`));
        const wavsDir = join(tempDir, "wavs");
        mkdirSync(wavsDir);
        console.log(`[LJSpeechExport] Created temp directory: ${tempDir}`);
        return { tempDir, wavsDir };
      }),

      // Use: Process export
      ({ tempDir, wavsDir }) =>
        Effect.gen(function* () {
          const db = yield* Database;

          // Fetch all segments for speaker with clips and transcriptions
          const dbSegments = yield* db.query.segments.findMany({
            where: eq(segments.speakerId, speakerId),
            with: {
              clips: {
                orderBy: [desc(clips.createdAt)],
                limit: 1,
              },
            },
            orderBy: (segments, { asc }) => [asc(segments.startTime)],
          });

          const segmentResults = dbSegments.map((s) => ({
            ...s,
            clip: s.clips[0] ?? null,
          }));

          // Filter to only segments with both clip AND transcription
          type ExportableSegment = (typeof segmentResults)[number] & {
            clip: NonNullable<(typeof segmentResults)[number]["clip"]> & {
              storageKey: string;
            };
            transcription: string;
          };

          const exportableSegments = segmentResults.filter(
            (s): s is ExportableSegment => {
              if (
                s.clip?.storageKey == null ||
                s.transcription == null ||
                s.transcription.trim().length === 0
              ) {
                return false;
              }

              // Duration filter
              const durRaw = s.endTime - s.startTime;
              const dur = Number(durRaw.toFixed(1));
              if (minDuration != null && dur < minDuration) return false;
              if (maxDuration != null && dur > maxDuration) return false;

              // Score filter (only use clip scores)
              type ScoreData = { DNSMOS?: { P808_MOS?: number } };
              const clipScores = s.clip.scores as ScoreData | null;
              const rawScore = clipScores?.DNSMOS?.P808_MOS;

              if (minScore != null || maxScore != null) {
                const minS = minScore ?? 1;
                const maxS = maxScore ?? 5;
                const isFullRange = minS <= 1 && maxS >= 5;
                if (rawScore == null) {
                  if (!isFullRange) return false;
                } else {
                  const score = Number(rawScore.toFixed(1));
                  if (score < minS || score > maxS) return false;
                }
              }

              return true;
            },
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
          let processedCount = 0;

          // Process each segment with concurrency
          const processResults = yield* Effect.forEach(
            exportableSegments,
            (segment, i) =>
              Effect.gen(function* () {
                const clipStorageKey = segment.clip.storageKey;
                const transcription = segment.transcription.trim();

                // Generate filename (1-indexed, zero-padded)
                const index = String(i + 1).padStart(5, "0");
                const filename = `${speakerPrefix}_${index}`;
                const wavPath = join(wavsDir, `${filename}.wav`);

                // Download audio directly to temp file
                const inputPath = join(tempDir, `input_${index}.flac`);
                yield* downloadAudioFile(clipStorageKey, inputPath);

                // Convert to WAV: mono, 16-bit PCM, specified sample rate
                yield* AudioProcessingService.convertToWav({
                  inputPath,
                  outputPath: wavPath,
                  sampleRate,
                  channels: 1,
                  bitDepth: 16,
                });

                // Update metrics
                processedCount += 1;
                const duration = segment.endTime - segment.startTime;

                // Report progress safely
                yield* Effect.promise(() =>
                  job.updateProgress({
                    type: "export",
                    processed: processedCount,
                    total: exportableSegments.length,
                  }),
                );

                console.log(
                  `[LJSpeechExport] Processed ${processedCount}/${exportableSegments.length}: ${filename}`,
                );

                return {
                  metadataLine: `wavs/${filename}.wav|${transcription}`,
                  filename,
                  duration,
                };
              }),
            { concurrency: 5 },
          );

          metadataLines.push(...processResults.map((r) => r.metadataLine));
          totalDuration = processResults.reduce(
            (sum, r) => sum + r.duration,
            0,
          );

          // Build tar.gz archive using Bun.Archive
          // NOTE: Must use Uint8Array (eager read) instead of Bun.file() (Blob)
          // because Bun.Archive has a bug where Blob entries produce 0-byte files.
          const archiveEntries: Record<string, string | Uint8Array> = {
            "metadata.csv": metadataLines.join("\n"),
          };

          for (const result of processResults) {
            const wavBytes = yield* Effect.promise(() =>
              Bun.file(join(wavsDir, `${result.filename}.wav`)).bytes(),
            );
            archiveEntries[`wavs/${result.filename}.wav`] = wavBytes;
          }

          const archive = new Bun.Archive(archiveEntries, {
            compress: "gzip",
          });

          console.log(
            `[LJSpeechExport] Created tar.gz archive (${processResults.length} files)`,
          );

          // Upload to R2
          const timestamp = Date.now();
          const exportKey = `exports/${userId}/${timestamp}-${speakerId.slice(0, 8)}.tar.gz`;

          // Write archive to disk first to avoid loading GBs into memory
          const archivePath = join(tempDir, "dataset.tar.gz");
          yield* Effect.promise(() => Bun.write(archivePath, archive));

          const archiveFile = Bun.file(archivePath);
          yield* StorageService.upload({
            key: exportKey,
            body: archiveFile,
            contentType: "application/gzip",
            contentLength: archiveFile.size,
          });

          console.log(`[LJSpeechExport] Uploaded to R2: ${exportKey}`);

          // Generate presigned download URL (24h expiry)
          const { url: downloadUrl } =
            yield* StorageService.generatePresignedUrl({
              key: exportKey,
              operation: "download",
              expiresIn: 24 * 60 * 60, // 24 hours
              responseContentDisposition: `attachment; filename="${speakerPrefix}_dataset.tar.gz"`,
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
  [AudioJobs.Diarize]: handleDiarize,
  [AudioJobs.Denoise]: handleDenoise,
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

const PROCESSING_JOBS: AudioJobName[] = [AudioJobs.Denoise];

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
  if (pollInterval) clearInterval(pollInterval);
  await worker.close();
  await audioQueue.close();
  await connection.quit();
  process.exit(0);
}

// ============================================================================
// Pull System for pending uploads
// ============================================================================

const startPollingPendingSources = () => {
  return setInterval(() => {
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const pendingSources = yield* db.query.sources.findMany({
          where: eq(sources.status, "pending"),
        });

        if (pendingSources.length > 0) {
          console.log(
            `\n[PullSystem] Checking ${pendingSources.length} pending source(s)...`,
          );
        }

        const now = Date.now();
        // Presigned upload URLs typically expire in 1-12 hours.
        // We consider an upload failed if it hasn't completed in 10 minutes.
        const MAX_PENDING_MS = 60 * 60 * 1000;

        for (const source of pendingSources) {
          // If the source has been pending for way too long (e.g. user aborted upload)
          // we mark it as failed to prevent polling it forever.
          const isStale = now - source.createdAt.getTime() > MAX_PENDING_MS;

          if (isStale) {
            console.warn(
              `[PullSystem] Source ${source.id} has been pending for over 10 minutes. Marking as failed.`,
            );
            yield* db
              .update(sources)
              .set({
                status: "failed",
                error: "Upload timed out or was aborted.",
              })
              .where(eq(sources.id, source.id));
            continue;
          }

          console.log(`[PullSystem] Verifying ${source.storageKey}`);

          try {
            const fileExists = yield* StorageService.exists({
              key: source.storageKey,
            });

            if (fileExists) {
              console.log(
                `[PullSystem] HEAD successful! ${source.storageKey} is fully uploaded.`,
              );
              // File is completely uploaded!
              yield* db
                .update(sources)
                .set({ status: "processing" })
                .where(eq(sources.id, source.id));

              yield* Effect.tryPromise({
                try: () =>
                  audioQueue.add(AudioJobs.IngestSource, {
                    entryId: source.id,
                    queueDiarization: source.diarization?.status === "pending",
                  }),
                catch: (error) => new Error(`Failed to enqueue: ${error}`),
              });

              console.log(
                `[PullSystem] Enqueued ingest for source ${source.id}`,
              );
            } else {
              console.log(
                `[PullSystem] Still pending/uploading: ${source.storageKey}`,
              );
            }
          } catch (error) {
            console.error(
              `[PullSystem] Error checking source ${source.id}:`,
              error,
            );
          }
        }
      }),
    ).catch(console.error);
  }, 10000); // 10 seconds
};

const pollInterval = startPollingPendingSources();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

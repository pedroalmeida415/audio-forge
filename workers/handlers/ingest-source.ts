import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { sources } from "../../src/server/db/schema";
import { AudioProcessingService } from "../../src/services/audio/audio-processing-service";
import { Database } from "../../src/services/infra/database";
import {
  AudioJobs,
  QueueService,
  Queues,
} from "../../src/services/queue/queue-service";
import { StorageService } from "../../src/services/storage/storage-service";
import type { JobHandler } from "../lib/types";

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
export const handleIngestSource: JobHandler = (job) =>
  Effect.gen(function* () {
    const sourceId = job.data.entryId;
    const shouldQueueDiarization = job.data.queueDiarization === true;
    console.log(`[IngestSource] Processing source ${sourceId}`);

    return yield* Effect.acquireUseRelease(
      Effect.sync(() =>
        mkdtempSync(join(tmpdir(), `audio-forge-ingest-${sourceId}-`)),
      ),

      (stagedDir) =>
        Effect.gen(function* () {
          const db = yield* Database;
          const source = yield* db.query.sources.findFirst({
            where: eq(sources.id, sourceId),
          });

          if (!source) {
            return yield* Effect.fail(
              new Error(`Source ${sourceId} not found`),
            );
          }

          const rawStorageKey = source.storageKey;
          if (!rawStorageKey) {
            return yield* Effect.fail(
              new Error(`Source ${sourceId} has no storage key`),
            );
          }

          const stagedPath = join(stagedDir, "raw-upload");
          const normalizedFlacPath = join(stagedDir, `${sourceId}.flac`);
          const waveformPath = join(stagedDir, `${sourceId}.dat`);

          console.log(
            `[IngestSource] Downloading raw upload: ${rawStorageKey}`,
          );
          const { url: downloadUrl } =
            yield* StorageService.generatePresignedUrl({
              key: rawStorageKey,
              operation: "download",
              expiresIn: 3600,
            });

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

          console.log(
            `[IngestSource] Converting audio to FLAC for ${sourceId}`,
          );
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
            try: async () =>
              Buffer.from(await Bun.file(waveformPath).bytes()),
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
            yield* QueueService.enqueueJob(
              Queues.AudioProcessing,
              AudioJobs.Diarize,
              { entryId: sourceId },
            );
          }

          yield* db
            .update(sources)
            .set(update)
            .where(eq(sources.id, sourceId));
          console.log(`[IngestSource] Source ${sourceId} completed`);

          return undefined;
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              const db = yield* Database;
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : "Unknown ingest error";

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

      (stagedDir) =>
        Effect.sync(() => {
          try {
            rmSync(stagedDir, { recursive: true, force: true });
          } catch (e) {
            console.error(`Failed to clean up staging directory: ${e}`);
          }
        }),
    );
  });

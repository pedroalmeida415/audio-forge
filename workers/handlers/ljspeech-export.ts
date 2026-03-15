import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { clips, segments, speakers } from "../../src/server/db/schema";
import { AudioProcessingService } from "../../src/services/audio/audio-processing-service";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { downloadToFile } from "../lib/media";
import type { ExportJobHandler, LJSpeechExportResult } from "../lib/types";

/**
 * Export segments as LJSpeech dataset (tar.gz with WAV files + metadata.csv).
 *
 * Flow:
 * 1. Fetch all segments for speaker with clips and transcriptions
 * 2. Filter to segments with both clip AND transcription
 * 3. For each exportable segment:
 *    - Fetch clip audio from media server
 *    - Convert to WAV at specified sample rate (mono, 16-bit PCM)
 *    - Add to metadata.csv
 * 4. Create tar.gz archive
 * 5. Upload to R2 and generate presigned download URL
 */
export const handleLJSpeechExport: ExportJobHandler = (job) =>
  Effect.gen(function* () {
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

    return yield* Effect.acquireUseRelease(
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
                yield* downloadToFile({
                  storageKey: clipStorageKey,
                  outputPath: inputPath,
                });

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
    );
  });

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { segments } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { ensureClipExists } from "../lib/clips";
import { buildMediaServerUrl } from "../lib/media";
import { callTranscriptionServer } from "../lib/speech-server";
import type { ClipJobResult, JobHandler } from "../lib/types";

/**
 * Transcribe a segment's audio.
 * entryId = segmentId
 * Ensures clip exists, then transcribes and saves to segment.
 */
export const handleTranscribe: JobHandler = (job) =>
  Effect.gen(function* () {
    const segmentId = job.data.entryId;
    const useExistingClip = job.data.useExistingClip;

    console.log(`[Transcribe] Processing segment ${segmentId}`);

    return yield* Effect.acquireUseRelease(
      Effect.sync(() =>
        mkdtempSync(join(tmpdir(), `transcribe-${segmentId}-`)),
      ),

      (tempDir) =>
        Effect.gen(function* () {
          const db = yield* Database;

          // Ensure clip exists (creates if needed, streams to tempDir)
          const result = yield* ensureClipExists(
            segmentId,
            tempDir,
            useExistingClip,
          );
          console.log(`[Transcribe] Clip ready: ${result.clip.storageKey}`);

          // Generate presigned URL and construct media server URL for the clip
          const { url: presignedUrl } =
            yield* StorageService.generatePresignedUrl({
              key: result.clip.storageKey,
              operation: "download",
              expiresIn: 3600,
            });
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
            return yield* Effect.fail(
              new Error(`Segment ${segmentId} not found`),
            );
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

          console.log(
            `[Transcribe] Transcription saved for segment ${segmentId}`,
          );

          return {
            ...result,
            segmentTags: updatedSegment?.tags ?? existingSegment.tags,
          } satisfies ClipJobResult;
        }),

      (tempDir) =>
        Effect.sync(() => {
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.error(`[Transcribe] Failed to clean up temp dir: ${e}`);
          }
        }),
    );
  });

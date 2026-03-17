import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { clips } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { ensureClipExists } from "../lib/clips";
import { buildMediaServerUrl } from "../lib/media";
import { callScoringServer } from "../lib/speech-server";
import type { ClipJobResult, JobHandler } from "../lib/types";

/**
 * Calculate DNSMOS quality scores for a segment's audio.
 * entryId = segmentId
 *
 * Fetches the clip audio from media server, sends to speech scoring server,
 * and updates DB with scores.
 */
export const handleCalculateScore: JobHandler = (job) =>
  Effect.gen(function* () {
    const segmentId = job.data.entryId;
    console.log(`[CalculateScore] Processing segment ${segmentId}`);

    return yield* Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), `score-${segmentId}-`))),

      (tempDir) =>
        Effect.gen(function* () {
          const db = yield* Database;

          // Ensure clip exists (creates if needed, streams to tempDir)
          const result = yield* ensureClipExists(segmentId, tempDir);
          console.log(`[CalculateScore] Clip ready: ${result.clip.storageKey}`);

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

      (tempDir) =>
        Effect.sync(() => {
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.error(`[CalculateScore] Failed to clean up temp dir: ${e}`);
          }
        }),
    );
  });

import { desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { clips, segments } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { createClip } from "../lib/clips";
import { buildMediaServerUrl } from "../lib/media";
import { callDenoiseServer } from "../lib/speech-server";
import type { ClipJobResult, JobHandler, SegmentContext } from "../lib/types";

/**
 * Denoise a segment's audio.
 * entryId = segmentId
 *
 * Flow:
 * 1. Check if clip already exists → return early if so
 * 2. Extract raw audio from source file (no R2 upload yet)
 * 3. Denoise audio via speech processing server (true stream pipe)
 * 4. Upload denoised audio to R2 directly from stream and create clip record
 * 5. Return result (auto-triggers scoring of processed clip)
 */
export const handleDenoise: JobHandler = (job) =>
  Effect.gen(function* () {
    const segmentId = job.data.entryId;
    const useExistingClip = job.data.useExistingClip;

    console.log(`[Denoise] Processing segment ${segmentId}`);

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
      const { url: presignedUrl } = yield* StorageService.generatePresignedUrl({
        key: latestClip.storageKey,
        operation: "download",
        expiresIn: 3600,
      });
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
      const { url: presignedUrl } = yield* StorageService.generatePresignedUrl({
        key: sourceStorageKey,
        operation: "download",
        expiresIn: 3600,
      });
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

    // Denoise audio and stream directly to R2 (true stream pipe)
    console.log(`[Denoise] Denoising audio for segment ${segmentId}`);
    const { body } = yield* callDenoiseServer(audioUrl);

    // Pipe denoise response stream directly to R2 via createClip
    const result = yield* createClip({
      body,
      context,
      contentType: "audio/flac",
      extension: "flac",
    });

    // Remove 'Outdated Clip' tag if it exists
    yield* db
      .update(segments)
      .set({
        tags: sql`array_remove(${segments.tags}, 'Outdated Clip')`,
      })
      .where(eq(segments.id, segmentId));

    console.log(`[Denoise] Clip created: ${result.clip.storageKey}`);

    return result satisfies ClipJobResult;
  });

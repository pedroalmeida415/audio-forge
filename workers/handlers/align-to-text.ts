import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { segments } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { buildMediaServerUrl } from "../lib/media";
import { callAlignmentServer } from "../lib/speech-server";
import type { JobHandler } from "../lib/types";

/**
 * Align a segment's timestamps to its transcription using CTC forced alignment.
 * entryId = segmentId
 *
 * Flow:
 * 1. Look up segment (with source) to get timestamps + transcription
 * 2. Validate segment has transcription text
 * 3. Request padded audio (±500ms) from the media server as 16kHz WAV
 * 4. Call alignment server → sentence-level timestamps relative to padded audio
 * 5. Map first/last aligned timestamps back to source timeline
 * 6. Update segment startTime/endTime in database
 */
export const handleAlignToText: JobHandler = (job) =>
  Effect.gen(function* () {
    const segmentId = job.data.entryId;

    console.log(`[AlignToText] Processing segment ${segmentId}`);

    const db = yield* Database;

    const segment = yield* db.query.segments.findFirst({
      where: eq(segments.id, segmentId),
      with: { source: true },
    });

    if (!segment) {
      return yield* Effect.fail(new Error(`Segment ${segmentId} not found`));
    }

    if (!segment.transcription?.trim()) {
      return yield* Effect.fail(
        new Error(`Segment ${segmentId} has no transcription — cannot align`),
      );
    }

    const sourceStorageKey = segment.source.storageKey;
    const sourceDuration = segment.source.duration ?? Number.POSITIVE_INFINITY;

    // Apply 500ms padding on both sides, clamped to source bounds
    const PADDING = 0.5;
    const paddedStart = Math.max(0, segment.startTime - PADDING);
    const paddedEnd = Math.min(sourceDuration, segment.endTime + PADDING);

    console.log(
      `[AlignToText] Requesting padded audio: ${paddedStart.toFixed(3)}s – ${paddedEnd.toFixed(3)}s (original: ${segment.startTime.toFixed(3)}s – ${segment.endTime.toFixed(3)}s)`,
    );

    // Generate presigned URL and build media server URL for 16kHz WAV
    const { url: presignedUrl } = yield* StorageService.generatePresignedUrl({
      key: sourceStorageKey,
      operation: "download",
      expiresIn: 3600,
    });

    const audioUrl = buildMediaServerUrl({
      presignedUrl,
      start: paddedStart,
      end: paddedEnd,
      format: "wav",
      sampleRate: 16000,
    });

    // Run forced alignment
    const alignmentResult = yield* callAlignmentServer(
      audioUrl,
      segment.transcription,
    );

    if (alignmentResult.segments.length === 0) {
      return yield* Effect.fail(
        new Error(`Alignment returned no segments for segment ${segmentId}`),
      );
    }

    // Map aligned timestamps back to source timeline
    const firstAligned = alignmentResult.segments[0];
    const lastAligned =
      alignmentResult.segments[alignmentResult.segments.length - 1];

    if (!firstAligned || !lastAligned) {
      return yield* Effect.fail(
        new Error(
          `Alignment returned invalid segments for segment ${segmentId}`,
        ),
      );
    }

    const newStartTime = paddedStart + firstAligned.start;
    const newEndTime = paddedStart + lastAligned.end;

    console.log(
      `[AlignToText] Aligned: ${segment.startTime.toFixed(3)}s–${segment.endTime.toFixed(3)}s → ${newStartTime.toFixed(3)}s–${newEndTime.toFixed(3)}s`,
    );

    // Update segment timestamps
    yield* db
      .update(segments)
      .set({
        startTime: newStartTime,
        endTime: newEndTime,
      })
      .where(eq(segments.id, segmentId));

    console.log(`[AlignToText] Segment ${segmentId} timestamps updated`);

    return {
      segmentId,
      previousStart: segment.startTime,
      previousEnd: segment.endTime,
      newStart: newStartTime,
      newEnd: newEndTime,
    };
  });

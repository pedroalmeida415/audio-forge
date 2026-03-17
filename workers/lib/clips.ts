import { join } from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { clips, segments } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { downloadToFile } from "./media";
import type { EnsureClipResult, SegmentContext } from "./types";

/**
 * Upload audio to R2 and create a clip DB record.
 * Accepts any body type supported by the S3 SDK (BunFile, ReadableStream, Buffer, etc.).
 * For file-based uploads, pass Bun.file(path) with contentLength for optimal multipart.
 * For stream-based uploads (e.g. piping a denoise response), omit contentLength.
 */
export const createClip = (params: {
  body: import("@smithy/types").StreamingBlobPayloadInputTypes;
  contentLength?: number;
  context: SegmentContext;
  contentType: string;
  extension: string;
}) =>
  Effect.gen(function* () {
    const { body, contentLength, context, contentType, extension } = params;
    const db = yield* Database;

    // Generate storage key for clip (using timestamp to avoid media server caching)
    const clipStorageKey = `clips/${context.userId}/${context.segmentId}_${Date.now()}.${extension}`;

    console.log(
      `[createClip] Uploading clip for segment ${context.segmentId}: ${clipStorageKey}${contentLength ? ` (${contentLength} bytes)` : " (streaming)"}`,
    );

    // Upload to R2 (streaming — S3 SDK handles multipart automatically)
    yield* StorageService.upload({
      key: clipStorageKey,
      body,
      contentType,
      contentLength,
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
      `[createClip] Created clip for segment ${context.segmentId}: ${clipStorageKey}`,
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
 * If no clip exists (or useExistingClip is false), extracts audio from the source
 * file, streams it to a temp file, uploads from disk, and creates a clip record.
 *
 * @param tempDir - Temp directory for staging files (caller manages cleanup)
 */
export const ensureClipExists = (
  segmentId: string,
  tempDir: string,
  useExistingClip?: boolean,
) =>
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

    // Fetch slice from media server → stream to temp file on disk
    const slicePath = join(tempDir, `${segmentId}-slice.flac`);
    yield* downloadToFile({
      storageKey: sourceStorageKey,
      start: segment.startTime,
      end: segment.endTime,
      outputPath: slicePath,
    });

    // Upload from disk and create clip record
    const file = Bun.file(slicePath);
    const result = yield* createClip({
      body: file,
      contentLength: file.size,
      context: {
        segmentId,
        speakerId: segment.speakerId,
        userId: segment.speaker.userId,
        startTime: segment.startTime,
        endTime: segment.endTime,
      },
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

    console.log(
      `[ensureClipExists] Created clip for segment ${segmentId}: ${result.clip.storageKey}`,
    );

    return result;
  });

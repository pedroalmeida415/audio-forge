import { Effect } from "effect";
import { StorageService } from "../../src/services/storage/storage-service";

// ============================================================================
// Server Configuration
// ============================================================================

const mediaServerUrl = process.env.MEDIA_SERVER_URL ?? "http://localhost:3002";

// ============================================================================
// URL Builder
// ============================================================================

/**
 * Build a media server URL for a given presigned URL.
 * The presigned URL is passed as the `url` query parameter.
 * Optionally includes start/end for time-sliced access and format.
 */
export const buildMediaServerUrl = (params: {
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
// Download Helpers
// ============================================================================

/**
 * Download audio from the media server and stream it to a file on disk.
 * Generates a presigned URL for the storage key, passes it to the media server,
 * and streams the response directly to `outputPath`.
 *
 * Supports optional `start`/`end` for time-sliced access (used by ensureClipExists).
 * Without `start`/`end`, downloads the full file (used by LJSpeech export).
 *
 * Uses Bun.file().writer() for streaming to avoid the known Bun bug where
 * Bun.write(path, response) hangs for large remote responses.
 * @see https://github.com/oven-sh/bun/issues/13237
 */
export const downloadToFile = (params: {
  storageKey: string;
  outputPath: string;
  start?: number;
  end?: number;
}) =>
  Effect.gen(function* () {
    const { url: presignedUrl } = yield* StorageService.generatePresignedUrl({
      key: params.storageKey,
      operation: "download",
      expiresIn: 3600,
    });
    const mediaUrl = buildMediaServerUrl({
      presignedUrl,
      start: params.start,
      end: params.end,
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
        if (!response.body) {
          throw new Error("Media server returned no body");
        }
        const writer = Bun.file(params.outputPath).writer();
        for await (const chunk of response.body) {
          writer.write(chunk);
        }
        await writer.end();
      },
      catch: (error) =>
        new Error(
          `Failed to download from media server: ${error instanceof Error ? error.message : String(error)}`,
        ),
    });

    return params.outputPath;
  });

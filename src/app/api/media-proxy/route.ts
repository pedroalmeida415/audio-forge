import { type NextRequest, NextResponse } from "next/server";
import {
  streamAudioSlice,
  streamFullAudio,
} from "~/lib/media-proxy/stream-audio";
import { auth } from "~/server/better-auth";
import { getSourceCache } from "~/services/media-proxy/source-cache";

/**
 * Media Proxy endpoint for streaming audio slices
 *
 * GET /api/media-proxy?storageKey=X&startMs=0&endMs=15000
 *
 * - storageKey: R2 storage key (must contain user's ID for ownership validation)
 * - startMs: Start time in milliseconds (optional, defaults to streaming whole file)
 * - endMs: End time in milliseconds (optional, defaults to streaming whole file)
 */
export async function GET(request: NextRequest) {
  // 1. Auth - verify user is logged in
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse query params
  const params = request.nextUrl.searchParams;
  const storageKey = params.get("storageKey");
  const startMsParam = params.get("startMs");
  const endMsParam = params.get("endMs");

  if (!storageKey) {
    return NextResponse.json({ error: "Missing storageKey" }, { status: 400 });
  }

  // 3. Validate ownership - storageKey must contain user's ID
  // StorageKey format: diarization/{userId}/... or clips/{userId}/...
  if (!storageKey.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 4. Get source from cache (or download from R2)
    const sourceCache = getSourceCache();
    const localPath = await sourceCache.getOrDownload(storageKey);

    // 5. Stream audio
    if (startMsParam !== null && endMsParam !== null) {
      // Slice mode - stream specific time range
      const startMs = Number(startMsParam);
      const endMs = Number(endMsParam);

      if (
        Number.isNaN(startMs) ||
        Number.isNaN(endMs) ||
        startMs < 0 ||
        endMs <= startMs
      ) {
        return NextResponse.json(
          { error: "Invalid time range" },
          { status: 400 },
        );
      }

      return streamAudioSlice({ localPath, startMs, endMs });
    }

    // Full file mode - stream entire file
    return streamFullAudio({ localPath });
  } catch (error) {
    console.error("[media-proxy] Error:", error);

    if (error instanceof Error && error.message.includes("NoSuchKey")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

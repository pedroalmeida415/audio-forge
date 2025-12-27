import { S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "~/env";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { clippingSessions, files } from "~/server/db/schema";
import { getAudioCache, transcodeSegment } from "~/services/media-proxy";

// Create S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

// Get audio cache instance
const audioCache = getAudioCache(s3Client, env.CLOUDFLARE_R2_BUCKET);

// Query params schema
const querySchema = z.object({
  // Either provide sessionId (preferred) or storageKey directly
  sessionId: z.string().uuid().optional(),
  storageKey: z.string().optional(),
  // Time range in microseconds
  start: z.coerce.number().min(0),
  end: z.coerce.number().min(0),
  // Output format options
  codec: z.enum(["aac", "mp3", "opus"]).default("aac"),
  format: z.enum(["mp4", "webm", "mp3"]).default("mp4"),
});

// Security limits
const MAX_SEGMENT_DURATION = 300; // 5 minutes max per request
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Media Proxy API Route
 *
 * Transcodes audio segments on-the-fly from source files.
 * Eliminates need to store individual clip files.
 *
 * GET /api/media-proxy?sessionId=xxx&start=260000000&end=270000000&codec=aac&format=mp4
 * GET /api/media-proxy?storageKey=xxx&start=260000000&end=270000000
 *
 * Returns: Fragmented MP4 stream (MSE-compatible) or MP3
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now();

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse({
      sessionId: searchParams.get("sessionId"),
      storageKey: searchParams.get("storageKey"),
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      codec: searchParams.get("codec"),
      format: searchParams.get("format"),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const {
      sessionId,
      storageKey: directStorageKey,
      start,
      end,
      codec,
      format,
    } = parseResult.data;

    // Require either sessionId or storageKey
    if (!sessionId && !directStorageKey) {
      return NextResponse.json(
        { error: "Either sessionId or storageKey is required" },
        { status: 400 },
      );
    }

    // Convert microseconds to seconds
    const startSeconds = start / 1_000_000;
    const endSeconds = end / 1_000_000;
    const duration = endSeconds - startSeconds;

    // Validate segment duration
    if (duration <= 0) {
      return NextResponse.json(
        { error: "End time must be greater than start time" },
        { status: 400 },
      );
    }

    if (duration > MAX_SEGMENT_DURATION) {
      return NextResponse.json(
        {
          error: `Segment duration exceeds maximum of ${MAX_SEGMENT_DURATION} seconds`,
        },
        { status: 400 },
      );
    }

    // Authenticate user
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get storage key - either from clipping session or directly
    let storageKey: string;

    if (sessionId) {
      // Look up clipping session to get source file
      const clippingSession = await db.query.clippingSessions.findFirst({
        where: eq(clippingSessions.id, sessionId),
        with: {
          file: true,
        },
      });

      if (!clippingSession) {
        return NextResponse.json(
          { error: "Clipping session not found" },
          { status: 404 },
        );
      }

      // Verify user owns this session
      if (clippingSession.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!clippingSession.file?.storageKey) {
        return NextResponse.json(
          { error: "Source file not found" },
          { status: 404 },
        );
      }

      storageKey = clippingSession.file.storageKey;
    } else if (directStorageKey) {
      // Direct storage key access - verify ownership via files table
      const file = await db.query.files.findFirst({
        where: eq(files.storageKey, directStorageKey),
      });

      if (!file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      if (file.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      storageKey = directStorageKey;
    } else {
      // This shouldn't happen due to earlier validation, but satisfy TypeScript
      return NextResponse.json(
        { error: "Either sessionId or storageKey is required" },
        { status: 400 },
      );
    }

    // Get source audio from cache (downloads from R2 if needed)
    const cacheStart = performance.now();
    const localPath = await audioCache.getOrFetch(storageKey);
    const cacheTime = performance.now() - cacheStart;

    // Transcode the segment
    const transcodeStart = performance.now();
    const { stream, contentType, cleanup } = transcodeSegment({
      inputPath: localPath,
      startSeconds,
      duration,
      codec,
      format,
    });

    // Handle client disconnect
    request.signal.addEventListener("abort", () => {
      cleanup();
    });

    // Set timeout for transcoding
    const timeoutId = setTimeout(() => {
      cleanup();
    }, REQUEST_TIMEOUT);

    // Create response with streaming
    const response = new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
        // Custom timing headers for debugging
        "Server-Timing": [
          `cache;dur=${cacheTime.toFixed(2)}`,
          `total;dur=${(performance.now() - startTime).toFixed(2)}`,
        ].join(", "),
        // CORS headers for MSE
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Server-Timing, Content-Type",
      },
    });

    // Clear timeout when stream ends
    stream.on("end", () => {
      clearTimeout(timeoutId);
      const transcodeTime = performance.now() - transcodeStart;
      console.log(
        `[MediaProxy] Transcoded ${duration.toFixed(2)}s segment in ${transcodeTime.toFixed(0)}ms`,
      );
    });

    stream.on("error", () => {
      clearTimeout(timeoutId);
    });

    return response;
  } catch (error) {
    console.error("[MediaProxy] Error:", error);

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes("NoSuchKey")) {
        return NextResponse.json(
          { error: "Source file not found in storage" },
          { status: 404 },
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Handle preflight for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

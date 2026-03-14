import type { Context, Next } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { MediaCache } from "./cache";
import { processAudio } from "./stream";

// ============================================================================
// Environment Variables
// ============================================================================

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${name}`);
  }
  return parsed;
}

const config = {
  port: getEnvNumber("MEDIA_SERVER_PORT", 3002),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  cache: {
    dir: process.env.MEDIA_CACHE_DIR ?? "/tmp/media-cache",
    maxSizeBytes:
      getEnvNumber("MEDIA_CACHE_MAX_SIZE_GB", 10) * 1024 * 1024 * 1024,
    maxAgeMs: getEnvNumber("MEDIA_CACHE_MAX_AGE_HOURS", 24) * 60 * 60 * 1000,
  },
};

// ============================================================================
// Initialize Services
// ============================================================================

const cache = new MediaCache({
  cacheDir: config.cache.dir,
  maxSizeBytes: config.cache.maxSizeBytes,
  maxAgeMs: config.cache.maxAgeMs,
});

// ============================================================================
// Hono App
// ============================================================================

const app = new Hono();

// CORS middleware for browser requests
app.use(
  "/*",
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

// Health check
app.get("/health", (c) => {
  const stats = cache.getStats();
  return c.json({
    status: "ok",
    cache: {
      entries: stats.entries,
      sizeBytes: stats.sizeBytes,
      sizeMB: Math.round(stats.sizeBytes / 1024 / 1024),
    },
  });
});

// Common validation middleware for presigned URL
const validatePresignedUrl = async (c: Context, next: Next) => {
  const presignedUrl = c.req.query("url");
  if (!presignedUrl) {
    return c.json({ error: "Missing url parameter" }, 400);
  }

  try {
    new URL(presignedUrl);
  } catch {
    return c.json({ error: "Invalid url parameter" }, 400);
  }

  await next();
};

app.use("/audio/*", validatePresignedUrl);

function getContentType(ext: string): string {
  if (ext === "flac") return "audio/flac";
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "mp4" || ext === "fmp4") return "audio/mp4";
  return "application/octet-stream";
}

/**
 * Unified Audio streaming endpoint.
 * Serves the raw file if no modifications are needed, or transcodes/slices on-the-fly.
 */
app.get("/audio", async (c) => {
  const presignedUrl = c.req.query("url") as string;
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");
  const format = c.req.query("format");

  if (!format) {
    return c.json({ error: "Format parameter is required" }, 400);
  }

  let start: number | undefined;
  let end: number | undefined;

  if (startParam || endParam) {
    if (!startParam || !endParam) {
      return c.json(
        { error: "Both start and end parameters are required for slicing" },
        400,
      );
    }

    start = Number(startParam);
    end = Number(endParam);

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end <= start) {
      return c.json({ error: "Invalid time range" }, 400);
    }
  }

  try {
    const localPath = await cache.getOrDownload(presignedUrl);

    const ext = localPath.split(".").pop()?.toLowerCase() || "";

    // Serve raw file directly if no processing or transcoding is needed
    if (start === undefined && end === undefined && format === ext) {
      return new Response(Bun.file(localPath), {
        headers: {
          "Content-Type": getContentType(ext),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const { stream, contentType } = await processAudio({
      localPath,
      start,
      end,
      format,
      signal: c.req.raw.signal,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        "Accept-Ranges": "none",
      },
    });
  } catch (error) {
    console.error("[media-server] Error processing audio req:", error);
    if (
      error instanceof Error &&
      (error.message.includes("403") || error.message.includes("NoSuchKey"))
    ) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

function shutdown() {
  console.log("[media-server] Shutting down, flushing cache index...");
  cache.flush();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// Start Server
// ============================================================================

console.log(`[media-server] Starting on port ${config.port}`);
console.log(`[media-server] Cache dir: ${config.cache.dir}`);
console.log(
  `[media-server] Max cache size: ${config.cache.maxSizeBytes / 1024 / 1024 / 1024} GB`,
);
console.log(`[media-server] CORS origin: ${config.corsOrigin}`);

export default {
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 60, // 1 minute for large file downloads
};

import { Hono } from "hono";
import { cors } from "hono/cors";

import { createAuthMiddleware } from "./auth";
import { MediaCache } from "./cache";
import { extractFlacSlice, streamAudioSlice, streamRawFile } from "./stream";

// ============================================================================
// Environment Variables
// ============================================================================

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
  internalToken: getEnvOrThrow("MEDIA_SERVER_INTERNAL_TOKEN"),
  databaseUrl: getEnvOrThrow("DATABASE_URL"),
  authSecret: getEnvOrThrow("BETTER_AUTH_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  cache: {
    dir: process.env.MEDIA_CACHE_DIR ?? "/tmp/media-cache",
    maxSizeBytes:
      getEnvNumber("MEDIA_CACHE_MAX_SIZE_GB", 10) * 1024 * 1024 * 1024,
    maxAgeMs: getEnvNumber("MEDIA_CACHE_MAX_AGE_HOURS", 24) * 60 * 60 * 1000,
  },
  r2: {
    endpoint: getEnvOrThrow("CLOUDFLARE_R2_ENDPOINT"),
    accessKeyId: getEnvOrThrow("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: getEnvOrThrow("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    bucket: getEnvOrThrow("CLOUDFLARE_R2_BUCKET"),
  },
};

// ============================================================================
// Initialize Services
// ============================================================================

const cache = new MediaCache({
  cacheDir: config.cache.dir,
  maxSizeBytes: config.cache.maxSizeBytes,
  maxAgeMs: config.cache.maxAgeMs,
  r2Endpoint: config.r2.endpoint,
  r2AccessKeyId: config.r2.accessKeyId,
  r2SecretAccessKey: config.r2.secretAccessKey,
  r2Bucket: config.r2.bucket,
});

const authMiddleware = createAuthMiddleware({
  internalToken: config.internalToken,
  databaseUrl: config.databaseUrl,
  authSecret: config.authSecret,
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

// Health check (no auth required)
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

// Audio streaming endpoint (auth required)
app.get("/audio", authMiddleware, async (c) => {
  const storageKey = c.req.query("storageKey");
  const startMsParam = c.req.query("startMs");
  const endMsParam = c.req.query("endMs");
  const format = c.req.query("format"); // "flac" for lossless slice (workers)

  // storageKey is already validated by auth middleware
  if (!storageKey) {
    return c.json({ error: "Missing storageKey" }, 400);
  }

  try {
    // Get or download file from cache
    const localPath = await cache.getOrDownload(storageKey);

    // If time range provided, return slice
    if (startMsParam && endMsParam) {
      const startMs = Number(startMsParam);
      const endMs = Number(endMsParam);

      if (
        Number.isNaN(startMs) ||
        Number.isNaN(endMs) ||
        startMs < 0 ||
        endMs <= startMs
      ) {
        return c.json({ error: "Invalid time range" }, 400);
      }

      // format=flac: Return FLAC slice (for workers needing lossless audio)
      // default: Return fMP4 slice (for browser MSE playback)
      if (format === "flac") {
        return extractFlacSlice({ localPath, startMs, endMs });
      }

      return streamAudioSlice({ localPath, startMs, endMs });
    }

    // Otherwise stream raw file (for workers downloading full file)
    return streamRawFile({ localPath });
  } catch (error) {
    console.error("[media-server] Error streaming audio:", error);

    if (error instanceof Error && error.message.includes("NoSuchKey")) {
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

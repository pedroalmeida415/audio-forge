import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Effect, Layer, pipe } from "effect";
import IORedis from "ioredis";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import {
  ClipGenerationService,
  MockClipGenerationServiceLive,
} from "../src/services/clip/clip-generation-service";
import {
  DenoiseService,
  MockDenoiseServiceLive,
} from "../src/services/denoise/denoise-service";
import {
  MockOverlapRemovalServiceLive,
  OverlapRemovalService,
} from "../src/services/overlap/overlap-removal-service";
import type { ClipProcessingJobPayload } from "../src/services/queue/queue-service";

// Required environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const CLOUDFLARE_R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const CLOUDFLARE_R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const CLOUDFLARE_R2_SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const CLOUDFLARE_R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Validate required env vars
if (
  !DATABASE_URL ||
  !CLOUDFLARE_R2_ENDPOINT ||
  !CLOUDFLARE_R2_ACCESS_KEY_ID ||
  !CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  !CLOUDFLARE_R2_BUCKET
) {
  console.error("Missing required environment variables");
  console.error(
    "Required: DATABASE_URL, CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET",
  );
  process.exit(1);
}

// Database connection
const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

// Redis connection
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// S3 client for R2 with retry configuration
const s3Client = new S3Client({
  region: "auto",
  endpoint: CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
});

// Combined service layer for Effect runtime
const ServicesLive = Layer.mergeAll(
  MockClipGenerationServiceLive,
  MockDenoiseServiceLive,
  MockOverlapRemovalServiceLive,
);

// Helper: Download file from R2 to local temp file
async function downloadFromR2(key: string, localPath: string): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: CLOUDFLARE_R2_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body as Readable;

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(localPath);
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

// Helper: Upload buffer to R2 with retry
async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
  maxRetries = 3,
): Promise<void> {
  console.log(`[ProcessingWorker] Uploading ${key} (${buffer.length} bytes)`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      });

      await s3Client.send(command);
      console.log(`[ProcessingWorker] Upload successful on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[ProcessingWorker] Upload attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
      );

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}

// Process a single clip processing job
async function processClipJob(
  payload: ClipProcessingJobPayload,
): Promise<void> {
  const { segmentId, operations } = payload;

  console.log(
    `[ProcessingWorker] Processing segment ${segmentId} with operations: ${operations.join(", ")}`,
  );

  // Fetch segment with its session and file info
  const segment = await db.query.segments.findFirst({
    where: eq(schema.segments.id, segmentId),
    with: {
      session: {
        with: {
          file: true,
        },
      },
      clip: true,
    },
  });

  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`);
  }

  const file = segment.session.file;
  if (!file?.storageKey) {
    throw new Error(`Source file not found for segment: ${segmentId}`);
  }

  // Create or get existing clip record
  let clip = segment.clip;
  const isNewClip = !clip;

  if (isNewClip) {
    // Create clip record in pending state
    const [newClip] = await db
      .insert(schema.clips)
      .values({
        segmentId,
        status: "processing",
      })
      .returning();

    clip = newClip;
    console.log(`[ProcessingWorker] Created new clip record: ${clip.id}`);
  } else if (clip) {
    // Update existing clip to processing state
    await db
      .update(schema.clips)
      .set({ status: "processing", errorMessage: null })
      .where(eq(schema.clips.id, clip.id));
    console.log(`[ProcessingWorker] Updating existing clip: ${clip.id}`);
  }

  if (!clip) {
    throw new Error(`Failed to create or find clip for segment: ${segmentId}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), `clip-${segmentId}-`));

  try {
    // Convert segment times from seconds to milliseconds
    const startMs = Math.floor(segment.startTime * 1000);
    const endMs = Math.floor(segment.endTime * 1000);
    const durationMs = endMs - startMs;

    // Generate or use existing clip audio
    let audioBuffer: Buffer;
    let format = "flac";

    if (operations.includes("generate") || isNewClip) {
      // Generate clip from source audio via ClipGenerationService
      console.log(
        `[ProcessingWorker] Generating clip from ${file.storageKey} (${startMs}ms - ${endMs}ms)`,
      );

      const generateResult = await Effect.runPromise(
        pipe(
          Effect.flatMap(ClipGenerationService, (service) =>
            service.generateClip({
              sourceStorageKey: file.storageKey,
              startMs,
              endMs,
              outputFormat: "flac",
            }),
          ),
          Effect.provide(ServicesLive),
        ),
      );

      audioBuffer = generateResult.audioBuffer;
      format = generateResult.format;
      console.log(
        `[ProcessingWorker] Generated clip: ${audioBuffer.length} bytes`,
      );
    } else if (clip.storageKey) {
      // Download existing clip from R2
      const localClipPath = join(tempDir, "existing-clip.flac");
      await downloadFromR2(clip.storageKey, localClipPath);
      audioBuffer = await readFile(localClipPath);
      console.log(
        `[ProcessingWorker] Downloaded existing clip: ${audioBuffer.length} bytes`,
      );
    } else {
      throw new Error(`No existing clip storage and generate not requested`);
    }

    // Track processing flags
    let isDenoised = clip.isDenoised ?? false;
    let hasOverlapRemoved = clip.hasOverlapRemoved ?? false;

    // Apply denoise if requested
    if (operations.includes("denoise")) {
      console.log(`[ProcessingWorker] Applying denoise`);

      const denoiseResult = await Effect.runPromise(
        pipe(
          Effect.flatMap(DenoiseService, (service) =>
            service.denoise({
              audioBuffer,
              format,
            }),
          ),
          Effect.provide(ServicesLive),
        ),
      );

      audioBuffer = denoiseResult.audioBuffer;
      format = denoiseResult.format;
      isDenoised = true;
      console.log(
        `[ProcessingWorker] Denoise complete: ${audioBuffer.length} bytes`,
      );
    }

    // Apply overlap removal if requested
    if (operations.includes("overlap")) {
      console.log(`[ProcessingWorker] Applying overlap removal`);

      const overlapResult = await Effect.runPromise(
        pipe(
          Effect.flatMap(OverlapRemovalService, (service) =>
            service.removeOverlap({
              audioBuffer,
              format,
            }),
          ),
          Effect.provide(ServicesLive),
        ),
      );

      audioBuffer = overlapResult.audioBuffer;
      format = overlapResult.format;
      hasOverlapRemoved = true;
      console.log(
        `[ProcessingWorker] Overlap removal complete: ${audioBuffer.length} bytes, removed ${overlapResult.removedDurationMs}ms`,
      );
    }

    // Upload processed clip to R2
    const clipStorageKey = `clips/${clip.id}.flac`;
    await uploadToR2(audioBuffer, clipStorageKey, "audio/flac");

    // Update clip record with completed state
    await db
      .update(schema.clips)
      .set({
        status: "completed",
        storageKey: clipStorageKey,
        duration: durationMs / 1000, // Store duration in seconds
        isDenoised,
        hasOverlapRemoved,
        errorMessage: null,
      })
      .where(eq(schema.clips.id, clip.id));

    console.log(
      `[ProcessingWorker] Segment ${segmentId} clip processing completed`,
    );
  } catch (error) {
    console.error(`[ProcessingWorker] Segment ${segmentId} failed:`, error);

    // Mark clip as failed
    await db
      .update(schema.clips)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(schema.clips.id, clip.id));

    throw error;
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Create and start worker
const worker = new Worker<ClipProcessingJobPayload>(
  "clip-processing",
  async (job) => {
    await processClipJob(job.data);
  },
  {
    connection,
    concurrency: 2, // Process 2 clips in parallel
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

// Event handlers
worker.on("completed", (job) => {
  console.log(`[ProcessingWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[ProcessingWorker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[ProcessingWorker] Worker error:", err);
});

console.log("[ProcessingWorker] Clip processing worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[ProcessingWorker] Shutting down...");
  await worker.close();
  await connection.quit();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

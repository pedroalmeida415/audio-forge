import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
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
import ffmpeg from "fluent-ffmpeg";
import IORedis from "ioredis";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import type { ClipJobPayload } from "../src/services/queue/queue-service";

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

// Helper: Upload file to R2 with streaming and retry
async function uploadToR2(
  localPath: string,
  key: string,
  contentType: string,
  maxRetries = 3,
): Promise<void> {
  const stats = statSync(localPath);
  console.log(`[Worker] Uploading ${key} (${stats.size} bytes)`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create a fresh stream for each attempt
      const fileStream = createReadStream(localPath);

      const command = new PutObjectCommand({
        Bucket: CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
        ContentLength: stats.size,
      });

      await s3Client.send(command);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[Worker] Upload attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
      );

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

// Helper: Extract clip using ffmpeg
function extractClip(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

// Process a single clip job
async function processClipJob(payload: ClipJobPayload): Promise<void> {
  const { clipId, sourceStorageKey, startTime, endTime } = payload;

  console.log(
    `[Worker] Processing clip ${clipId}: ${startTime}s - ${endTime}s`,
  );

  // Update clip status to processing
  await db
    .update(schema.clips)
    .set({ status: "processing" })
    .where(eq(schema.clips.id, clipId));

  // Get clip to retrieve userId for storage key
  const clip = await db.query.clips.findFirst({
    where: eq(schema.clips.id, clipId),
  });

  if (!clip) {
    throw new Error(`Clip ${clipId} not found`);
  }

  // Create temp directory for this job
  const tempDir = mkdtempSync(join(tmpdir(), `clip-${clipId}-`));
  const sourceFile = join(tempDir, "source.audio");
  const clipLocalPath = join(tempDir, `${clipId}.mp3`);
  const clipStorageKey = `clips/${clip.userId}/${clipId}.mp3`;

  try {
    // Download source audio
    console.log(`[Worker] Downloading source audio: ${sourceStorageKey}`);
    await downloadFromR2(sourceStorageKey, sourceFile);

    // Extract clip
    console.log(`[Worker] Extracting clip: ${startTime}s - ${endTime}s`);
    await extractClip(sourceFile, clipLocalPath, startTime, endTime);

    // Upload to R2
    await uploadToR2(clipLocalPath, clipStorageKey, "audio/mpeg");

    // Create file record
    const [file] = await db
      .insert(schema.files)
      .values({
        userId: clip.userId,
        storageKey: clipStorageKey,
      })
      .returning();

    if (!file) {
      throw new Error("Failed to create file record");
    }

    // Update clip with file reference and mark as completed
    await db
      .update(schema.clips)
      .set({
        fileId: file.id,
        status: "completed",
      })
      .where(eq(schema.clips.id, clipId));

    console.log(`[Worker] Clip ${clipId} completed successfully`);
  } catch (error) {
    console.error(`[Worker] Clip ${clipId} failed:`, error);

    // Mark clip as failed
    await db
      .update(schema.clips)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(schema.clips.id, clipId));

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
const worker = new Worker<ClipJobPayload>(
  "clip-generation",
  async (job) => {
    await processClipJob(job.data);
  },
  {
    connection,
    concurrency: 4, // Process 4 clips in parallel
    limiter: {
      max: 20,
      duration: 60000,
    },
  },
);

// Event handlers
worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

console.log("[Worker] Clip generation worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down...");
  await worker.close();
  await connection.quit();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

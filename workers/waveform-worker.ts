import { execFile } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
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
import IORedis from "ioredis";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import type { WaveformJobPayload } from "../src/services/queue/queue-service";

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

// Helper: Upload file to R2 with buffer and retry
async function uploadToR2(
  localPath: string,
  key: string,
  contentType: string,
  maxRetries = 3,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const fileBuffer = await fs.readFile(localPath);
  console.log(`[WaveformWorker] Uploading ${key} (${fileBuffer.length} bytes)`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ContentLength: fileBuffer.length,
      });

      await s3Client.send(command);
      console.log(`[WaveformWorker] Upload successful on attempt ${attempt}`);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[WaveformWorker] Upload attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
      );

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}

// Helper: Generate waveform using audiowaveform via Docker
function generateWaveform(
  inputPath: string,
  outputPath: string,
  samplesPerPixel = 256,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const path = require("node:path");
    const workDir = path.dirname(inputPath);
    const inputFilename = path.basename(inputPath);
    const outputFilename = path.basename(outputPath);

    const args = [
      "run",
      "--rm",
      "-v",
      `${workDir}:/tmp`,
      "-w",
      "/tmp",
      "realies/audiowaveform",
      "-i",
      inputFilename,
      "-o",
      outputFilename,
      "--bits",
      "8",
      "-z",
      samplesPerPixel.toString(),
    ];

    console.log(`[WaveformWorker] Running: docker ${args.join(" ")}`);

    execFile("docker", args, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[WaveformWorker] audiowaveform stderr: ${stderr}`);
        reject(new Error(`audiowaveform failed: ${stderr || error.message}`));
        return;
      }
      if (stdout) {
        console.log(`[WaveformWorker] audiowaveform stdout: ${stdout}`);
      }
      resolve();
    });
  });
}

// Process a single waveform job
async function processWaveformJob(payload: WaveformJobPayload): Promise<void> {
  const { fileId, audioStorageKey } = payload;

  console.log(`[WaveformWorker] Processing file ${fileId}`);

  // Update file status to processing
  await db
    .update(schema.files)
    .set({ waveformStatus: "processing" })
    .where(eq(schema.files.id, fileId));

  // Create temp directory for this job
  const tempDir = mkdtempSync(join(tmpdir(), `waveform-${fileId}-`));
  const audioLocalPath = join(tempDir, "audio.flac");
  const waveformLocalPath = join(tempDir, "waveform.dat");
  const waveformStorageKey = `${audioStorageKey}.dat`;

  try {
    // Download source audio
    console.log(`[WaveformWorker] Downloading audio: ${audioStorageKey}`);
    await downloadFromR2(audioStorageKey, audioLocalPath);

    // Generate waveform
    console.log(`[WaveformWorker] Generating waveform`);
    await generateWaveform(audioLocalPath, waveformLocalPath);

    // Upload to R2
    await uploadToR2(
      waveformLocalPath,
      waveformStorageKey,
      "application/octet-stream",
    );

    // Update file record with waveform info
    await db
      .update(schema.files)
      .set({
        waveformStatus: "completed",
        waveformStorageKey,
        waveformError: null,
      })
      .where(eq(schema.files.id, fileId));

    console.log(`[WaveformWorker] File ${fileId} waveform completed`);
  } catch (error) {
    console.error(`[WaveformWorker] File ${fileId} failed:`, error);

    // Mark file waveform as failed
    await db
      .update(schema.files)
      .set({
        waveformStatus: "failed",
        waveformError: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(schema.files.id, fileId));

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
const worker = new Worker<WaveformJobPayload>(
  "waveform-generation",
  async (job) => {
    await processWaveformJob(job.data);
  },
  {
    connection,
    concurrency: 2, // Process 2 waveforms in parallel (CPU intensive)
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

// Event handlers
worker.on("completed", (job) => {
  console.log(`[WaveformWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[WaveformWorker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[WaveformWorker] Worker error:", err);
});

console.log("[WaveformWorker] Waveform generation worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[WaveformWorker] Shutting down...");
  await worker.close();
  await connection.quit();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

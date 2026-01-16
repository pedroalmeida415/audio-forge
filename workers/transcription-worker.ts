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
import type { TranscriptionJobPayload } from "../src/services/queue/queue-service";
import {
  MockTranscriptionServiceLive,
  TranscriptionService,
} from "../src/services/transcription/transcription-service";

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
  MockTranscriptionServiceLive,
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
  console.log(
    `[TranscriptionWorker] Uploading ${key} (${buffer.length} bytes)`,
  );

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
      console.log(
        `[TranscriptionWorker] Upload successful on attempt ${attempt}`,
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[TranscriptionWorker] Upload attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
      );

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}

// Process a single transcription job
async function processTranscriptionJob(
  payload: TranscriptionJobPayload,
): Promise<void> {
  const { segmentId, clipStorageKey } = payload;

  console.log(`[TranscriptionWorker] Processing segment ${segmentId}`);

  // Fetch segment with its session, file, and clip info
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

  const tempDir = mkdtempSync(join(tmpdir(), `transcription-${segmentId}-`));

  try {
    let audioBuffer: Buffer;
    const format = "flac";

    // Check if we have a clip storage key (existing clip)
    const existingClipKey = clipStorageKey ?? segment.clip?.storageKey;

    if (existingClipKey) {
      // Download existing clip from R2
      console.log(
        `[TranscriptionWorker] Downloading existing clip: ${existingClipKey}`,
      );
      const localClipPath = join(tempDir, "clip.flac");
      await downloadFromR2(existingClipKey, localClipPath);
      audioBuffer = await readFile(localClipPath);
      console.log(
        `[TranscriptionWorker] Downloaded clip: ${audioBuffer.length} bytes`,
      );
    } else {
      // Generate clip from source audio
      console.log(
        `[TranscriptionWorker] No clip exists, generating from source`,
      );

      const startMs = Math.floor(segment.startTime * 1000);
      const endMs = Math.floor(segment.endTime * 1000);

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
      console.log(
        `[TranscriptionWorker] Generated clip: ${audioBuffer.length} bytes`,
      );

      // If we generated a new clip, also persist it
      if (audioBuffer.length > 0) {
        // Create or update clip record
        let clip = segment.clip;
        if (!clip) {
          const [newClip] = await db
            .insert(schema.clips)
            .values({
              segmentId,
              status: "completed",
            })
            .returning();
          clip = newClip;
        }

        // Upload clip to R2
        const newClipStorageKey = `clips/${clip.id}.flac`;
        await uploadToR2(audioBuffer, newClipStorageKey, "audio/flac");

        // Update clip record with storage key
        await db
          .update(schema.clips)
          .set({
            status: "completed",
            storageKey: newClipStorageKey,
            duration: (segment.endTime - segment.startTime),
            errorMessage: null,
          })
          .where(eq(schema.clips.id, clip.id));

        console.log(
          `[TranscriptionWorker] Persisted generated clip: ${newClipStorageKey}`,
        );
      }
    }

    // Transcribe the audio
    console.log(`[TranscriptionWorker] Transcribing audio`);

    const transcribeResult = await Effect.runPromise(
      pipe(
        Effect.flatMap(TranscriptionService, (service) =>
          service.transcribe({
            audioBuffer,
            format,
          }),
        ),
        Effect.provide(ServicesLive),
      ),
    );

    console.log(
      `[TranscriptionWorker] Transcription complete: "${transcribeResult.text.substring(0, 50)}..."`,
    );

    // Update segment with transcription
    await db
      .update(schema.segments)
      .set({
        transcription: transcribeResult.text,
      })
      .where(eq(schema.segments.id, segmentId));

    console.log(
      `[TranscriptionWorker] Segment ${segmentId} transcription saved`,
    );
  } catch (error) {
    console.error(`[TranscriptionWorker] Segment ${segmentId} failed:`, error);
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
const worker = new Worker<TranscriptionJobPayload>(
  "transcription",
  async (job) => {
    await processTranscriptionJob(job.data);
  },
  {
    connection,
    concurrency: 4, // Transcription is mostly I/O bound, can handle more concurrency
    limiter: {
      max: 20,
      duration: 60000,
    },
  },
);

// Event handlers
worker.on("completed", (job) => {
  console.log(`[TranscriptionWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[TranscriptionWorker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[TranscriptionWorker] Worker error:", err);
});

console.log("[TranscriptionWorker] Transcription worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[TranscriptionWorker] Shutting down...");
  await worker.close();
  await connection.quit();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

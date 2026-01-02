import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { env } from "~/env";
import { isVideoMimeType } from "~/lib/video-types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clippingSessions, files } from "~/server/db/schema";
import {
  ServicesLive,
  StorageService,
  VideoExtractionService,
} from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, StorageService | VideoExtractionService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

// S3 client for direct uploads
const s3Client = new S3Client({
  region: "auto",
  endpoint: env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

// Helper: Stream ReadableStream to file
async function streamToFile(
  stream: ReadableStream<Uint8Array>,
  filePath: string,
): Promise<void> {
  const fileHandle = await import("node:fs/promises").then((fs) =>
    fs.open(filePath, "w"),
  );

  try {
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await fileHandle.write(value);
    }
  } finally {
    await fileHandle.close();
  }
}

// Helper: Upload file to R2
async function uploadToR2(
  localPath: string,
  key: string,
  contentType: string,
): Promise<void> {
  const stats = statSync(localPath);
  const fileStream = createReadStream(localPath);

  const command = new PutObjectCommand({
    Bucket: env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
    ContentLength: stats.size,
  });

  await s3Client.send(command);
}

export const fileRouter = createTRPCRouter({
  // Get presigned URL for uploading audio to R2
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        contentType: z.string().regex(/^audio\//),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedUploadUrl({
            fileName: input.fileName,
            contentType: input.contentType,
            userId: ctx.session.user.id,
          }),
        ),
      );

      return result;
    }),

  // Create file record and clipping session after upload
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        name: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Extract filename from storage key if not provided
      const fileName =
        input.name ?? input.storageKey.split("/").pop() ?? "Untitled";

      // Create file record
      const [file] = await ctx.db
        .insert(files)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          storageKey: input.storageKey,
          name: fileName,
        })
        .returning();

      if (!file) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create file record",
        });
      }

      // Create clipping session for this file (name defaults to file name)
      const [session] = await ctx.db
        .insert(clippingSessions)
        .values({
          fileId: file.id,
          projectId: input.projectId,
          userId: ctx.session.user.id,
          name: fileName,
        })
        .returning();

      if (!session) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create clipping session",
        });
      }

      return {
        file,
        session,
      };
    }),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const storageKey = file.storageKey;
      if (!storageKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audio file not found in storage",
        });
      }

      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: storageKey,
            expiresIn: 3600, // 1 hour
          }),
        ),
      );

      return audioUrl;
    }),

  // Delete a file (cascade will handle session and clips)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      // Delete from storage if file exists
      const storageKey = file.storageKey;
      if (storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: storageKey }),
          ),
        ).catch(() => {
          // Log but don't fail if storage deletion fails
          console.error("Failed to delete file from storage");
        });
      }

      // Delete file (cascade will handle related records)
      await ctx.db.delete(files).where(eq(files.id, input.id));

      return { success: true };
    }),

  // Upload video, extract audio to FLAC, and create file/session
  uploadVideo: protectedProcedure
    .input(octetInputParser)
    .mutation(async ({ ctx, input }) => {
      // Get metadata from headers
      // Content-Type is application/octet-stream for tRPC, actual type in x-content-type
      const contentType = ctx.headers.get("x-content-type");
      const projectId = ctx.headers.get("x-project-id");
      const filename = ctx.headers.get("x-filename") ?? "video";

      // Validate content type
      if (!contentType || !isVideoMimeType(contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file type. Expected a video file.",
        });
      }

      // Validate projectId
      if (!projectId || !z.string().uuid().safeParse(projectId).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing or invalid x-project-id header",
        });
      }

      // Create temp directory for processing
      const tempDir = mkdtempSync(join(tmpdir(), "video-extract-"));
      const videoPath = join(tempDir, "input.video");
      const audioPath = join(tempDir, "output.flac");

      try {
        // 1. Stream video to temp file
        await streamToFile(input, videoPath);

        // 2. Extract audio using VideoExtractionService
        const extractionResult = await runEffect(
          Effect.flatMap(VideoExtractionService, (service) =>
            service.extractAudio({
              inputPath: videoPath,
              outputPath: audioPath,
            }),
          ),
        ).catch((error) => {
          // Map Effect errors to TRPCError
          if (error._tag === "VideoExtractionError") {
            const code =
              error.code === "NO_AUDIO"
                ? "UNPROCESSABLE_CONTENT"
                : error.code === "CORRUPT_FILE"
                  ? "UNPROCESSABLE_CONTENT"
                  : "INTERNAL_SERVER_ERROR";
            throw new TRPCError({
              code,
              message: error.message,
            });
          }
          throw error;
        });

        // 3. Upload FLAC to R2
        // Generate storage key with timestamp and .flac extension
        const baseFilename = filename.replace(/\.[^/.]+$/, ""); // Remove extension
        const storageKey = `diarization/${ctx.session.user.id}/${Date.now()}-${baseFilename}.flac`;

        await uploadToR2(audioPath, storageKey, "audio/flac");

        // 4. Create file record
        const [file] = await ctx.db
          .insert(files)
          .values({
            userId: ctx.session.user.id,
            projectId,
            storageKey,
            name: `${baseFilename}.flac`,
            duration: extractionResult.durationSeconds || null,
          })
          .returning();

        if (!file) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create file record",
          });
        }

        // 5. Create clipping session
        const [session] = await ctx.db
          .insert(clippingSessions)
          .values({
            fileId: file.id,
            projectId,
            userId: ctx.session.user.id,
            name: `${baseFilename}.flac`,
          })
          .returning();

        if (!session) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create clipping session",
          });
        }

        return {
          file,
          session,
        };
      } finally {
        // Always cleanup temp files
        try {
          rmSync(tempDir, { recursive: true, force: true });
        } catch {
          console.error(
            "[uploadVideo] Failed to cleanup temp directory:",
            tempDir,
          );
        }
      }
    }),
});

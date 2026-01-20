import { createReadStream, createWriteStream, statSync } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Data, Effect } from "effect";
import { env } from "~/env";
import { S3ClientService } from "~/services/infra/s3-client";

// ============================================================================
// Types
// ============================================================================

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresAt: Date;
}

// ============================================================================
// Errors
// ============================================================================

export class StorageError extends Data.TaggedError("StorageError")<{
  operation: "upload" | "download" | "delete";
  message: string;
  key?: string;
  cause?: unknown;
}> {}

// ============================================================================
// Service
// ============================================================================

/**
 * Storage service for managing files in Cloudflare R2 (S3-compatible).
 *
 * Depends on S3ClientService for the underlying client connection.
 * Uses the bucket configured via CLOUDFLARE_R2_BUCKET env var.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const { url, key } = yield* StorageService.generatePresignedUploadUrl({
 *     fileName: "audio.mp3",
 *     contentType: "audio/mpeg",
 *     userId: "user-123",
 *   });
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(StorageService.Default)));
 * ```
 */
export class StorageService extends Effect.Service<StorageService>()(
  "StorageService",
  {
    effect: Effect.gen(function* () {
      const client = yield* S3ClientService;
      const bucket = env.CLOUDFLARE_R2_BUCKET;

      return {
        generatePresignedUploadUrl: (params: {
          fileName: string;
          contentType: string;
          userId: string;
        }) =>
          Effect.tryPromise({
            try: async () => {
              const key = `diarization/${params.userId}/${Date.now()}-${params.fileName}`;
              const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: params.contentType,
              });
              const url = await getSignedUrl(client, command, {
                expiresIn: 3600,
              });
              const expiresAt = new Date(Date.now() + 3600 * 1000);
              return { url, key, expiresAt } satisfies PresignedUrlResult;
            },
            catch: (error) =>
              new StorageError({
                operation: "upload",
                message: "Failed to generate presigned upload URL",
                cause: error,
              }),
          }),

        generatePresignedDownloadUrl: (params: {
          key: string;
          expiresIn?: number;
        }) =>
          Effect.tryPromise({
            try: async () => {
              const command = new GetObjectCommand({
                Bucket: bucket,
                Key: params.key,
              });
              return getSignedUrl(client, command, {
                expiresIn: params.expiresIn ?? 3600,
              });
            },
            catch: (error) =>
              new StorageError({
                operation: "download",
                message: "Failed to generate presigned download URL",
                key: params.key,
                cause: error,
              }),
          }),

        deleteObject: (params: { key: string }) =>
          Effect.tryPromise({
            try: async () => {
              const command = new DeleteObjectCommand({
                Bucket: bucket,
                Key: params.key,
              });
              await client.send(command);
            },
            catch: (error) =>
              new StorageError({
                operation: "delete",
                message: "Failed to delete object",
                key: params.key,
                cause: error,
              }),
          }),

        uploadFromPath: (params: {
          localPath: string;
          key: string;
          contentType: string;
        }) =>
          Effect.tryPromise({
            try: async () => {
              const stats = statSync(params.localPath);
              const fileStream = createReadStream(params.localPath);
              const command = new PutObjectCommand({
                Bucket: bucket,
                Key: params.key,
                Body: fileStream,
                ContentType: params.contentType,
                ContentLength: stats.size,
              });
              await client.send(command);
            },
            catch: (error) =>
              new StorageError({
                operation: "upload",
                message: "Failed to upload file from path",
                key: params.key,
                cause: error,
              }),
          }),

        downloadToPath: (params: { key: string; localPath: string }) =>
          Effect.tryPromise({
            try: async () => {
              const command = new GetObjectCommand({
                Bucket: bucket,
                Key: params.key,
              });
              const response = await client.send(command);
              const stream = response.Body as Readable;
              const writeStream = createWriteStream(params.localPath);
              await pipeline(stream, writeStream);
            },
            catch: (error) =>
              new StorageError({
                operation: "download",
                message: "Failed to download file to path",
                key: params.key,
                cause: error,
              }),
          }),
      };
    }),
    dependencies: [S3ClientService.Default],
    accessors: true,
  },
) {}

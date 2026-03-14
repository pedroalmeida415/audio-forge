import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
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
        generatePresignedUrl: (params: {
          key: string;
          operation: "upload" | "download";
          contentType?: string;
          expiresIn?: number;
          responseContentDisposition?: string;
        }) =>
          Effect.tryPromise({
            try: async () => {
              const command =
                params.operation === "upload"
                  ? new PutObjectCommand({
                      Bucket: bucket,
                      Key: params.key,
                      ContentType: params.contentType,
                    })
                  : new GetObjectCommand({
                      Bucket: bucket,
                      Key: params.key,
                      ResponseContentDisposition:
                        params.responseContentDisposition,
                    });

              const expiresIn = params.expiresIn ?? 3600;
              const url = await getSignedUrl(client, command, { expiresIn });
              const expiresAt = new Date(Date.now() + expiresIn * 1000);
              return {
                url,
                key: params.key,
                expiresAt,
              } satisfies PresignedUrlResult;
            },
            catch: (error) =>
              new StorageError({
                operation: params.operation,
                message: `Failed to generate presigned ${params.operation} URL`,
                key: params.key,
                cause: error,
              }),
          }),

        upload: (params: {
          key: string;
          body: Buffer | Readable | string | Uint8Array;
          contentType?: string;
          contentLength?: number;
        }) =>
          Effect.tryPromise({
            try: async () => {
              const upload = new Upload({
                client,
                params: {
                  Bucket: bucket,
                  Key: params.key,
                  Body: params.body,
                  ContentType: params.contentType,
                },
              });

              upload.on("httpUploadProgress", (progress) => {
                const loaded = progress.loaded ?? 0;
                if (progress.total) {
                  const percentage = Math.round(
                    (loaded / progress.total) * 100,
                  );
                  console.log(
                    `[StorageService] Uploading ${params.key}: ${percentage}% (${loaded}/${progress.total} bytes)`,
                  );
                } else {
                  console.log(
                    `[StorageService] Uploading ${params.key}: ${loaded} bytes loaded`,
                  );
                }
              });

              await upload.done();
            },
            catch: (error) =>
              new StorageError({
                operation: "upload",
                message: "Failed to upload file",
                key: params.key,
                cause: error,
              }),
          }),

        exists: (params: { key: string }) =>
          Effect.tryPromise({
            try: async () => {
              const command = new HeadObjectCommand({
                Bucket: bucket,
                Key: params.key,
              });
              await client.send(command);
              return true;
            },
            catch: (error) =>
              new StorageError({
                operation: "download",
                message: "Failed to check if file exists",
                key: params.key,
                cause: error,
              }),
          }),

        download: (params: { key: string }) =>
          Effect.tryPromise({
            try: async () => {
              const command = new GetObjectCommand({
                Bucket: bucket,
                Key: params.key,
              });
              const response = await client.send(command);
              return response.Body;
            },
            catch: (error) =>
              new StorageError({
                operation: "download",
                message: "Failed to download file",
                key: params.key,
                cause: error,
              }),
          }),

        delete: (params: { key: string }) =>
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
                message: "Failed to delete file",
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

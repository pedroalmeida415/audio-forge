import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect, Layer } from "effect";
import { env } from "~/env";
import {
  type PresignedUrlResult,
  StoragePresignError,
  StorageService,
  StorageUploadError,
} from "./storage-service";

const client = new S3Client({
  region: "auto",
  endpoint: env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});
const bucket = env.CLOUDFLARE_R2_BUCKET;

export const R2StorageServiceLive = Layer.succeed(
  StorageService,
  StorageService.of({
    generatePresignedUploadUrl: ({ fileName, contentType, userId }) =>
      Effect.tryPromise({
        try: async () => {
          const key = `diarization/${userId}/${Date.now()}-${fileName}`;
          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
          });
          const url = await getSignedUrl(client, command, { expiresIn: 3600 });
          const expiresAt = new Date(Date.now() + 3600 * 1000);
          return { url, key, expiresAt } satisfies PresignedUrlResult;
        },
        catch: (error) =>
          new StoragePresignError({
            message: "Failed to generate presigned upload URL",
            cause: error,
          }),
      }),

    generatePresignedDownloadUrl: ({ key, expiresIn = 3600 }) =>
      Effect.tryPromise({
        try: async () => {
          const command = new GetObjectCommand({ Bucket: bucket, Key: key });
          return getSignedUrl(client, command, { expiresIn });
        },
        catch: (error) =>
          new StoragePresignError({
            message: "Failed to generate presigned download URL",
            cause: error,
          }),
      }),

    deleteObject: ({ key }) =>
      Effect.tryPromise({
        try: async () => {
          const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
          await client.send(command);
        },
        catch: (error) =>
          new StorageUploadError({
            message: "Failed to delete object",
            cause: error,
          }),
      }),
  }),
);

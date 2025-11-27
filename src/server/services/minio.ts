import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

// Parse endpoint URL to extract host and port
const endpointUrl = new URL(env.MINIO_ENDPOINT);

export const s3Client = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: "us-east-1", // MinIO doesn't use regions, but AWS SDK requires it
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO
});

export const BUCKET_NAME = env.MINIO_BUCKET;

/**
 * Generate a presigned URL for uploading a file directly from the browser
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading/streaming a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get an object from MinIO as a stream
 */
export async function getObjectStream(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  return response.Body;
}

/**
 * Upload a buffer or stream to MinIO
 */
export async function uploadObject(
  key: string,
  body: Buffer | ReadableStream | Blob,
  contentType: string
) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  return s3Client.send(command);
}

/**
 * Delete an object from MinIO
 */
export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return s3Client.send(command);
}

/**
 * Generate a unique storage key for an audio file
 */
export function generateAudioFileKey(
  projectId: string,
  jobId: string,
  filename: string
): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `projects/${projectId}/jobs/${jobId}/uploads/${timestamp}-${sanitizedFilename}`;
}

/**
 * Generate a storage key for an extracted audio clip
 */
export function generateClipKey(
  projectId: string,
  collectionId: string,
  segmentId: string,
  format: string
): string {
  const timestamp = Date.now();
  return `projects/${projectId}/collections/${collectionId}/clips/${segmentId}-${timestamp}.${format}`;
}

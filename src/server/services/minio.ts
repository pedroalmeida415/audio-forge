import { Client } from "minio";
import { env } from "~/env";

// Parse endpoint URL to extract host and port
const endpointUrl = new URL(env.MINIO_ENDPOINT);

export const minioClient = new Client({
  endPoint: endpointUrl.hostname,
  port: endpointUrl.port ? Number.parseInt(endpointUrl.port, 10) : undefined,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const BUCKET_NAME = env.MINIO_BUCKET;

/**
 * Ensure the bucket exists before performing operations
 */
async function ensureBucketExists(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      throw new Error(`Bucket '${BUCKET_NAME}' does not exist`);
    }
  } catch (error) {
    throw new Error(
      `Failed to verify bucket existence: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a presigned URL for uploading a file directly from the browser
 */
export async function getPresignedUploadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  try {
    await ensureBucketExists();
    return await minioClient.presignedPutObject(BUCKET_NAME, key, expiresIn);
  } catch (error) {
    throw new Error(
      `Failed to generate presigned upload URL: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a presigned URL for downloading/streaming a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  try {
    await ensureBucketExists();
    return await minioClient.presignedGetObject(BUCKET_NAME, key, expiresIn);
  } catch (error) {
    throw new Error(
      `Failed to generate presigned download URL: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get an object from MinIO as a stream
 */
export async function getObjectStream(key: string) {
  try {
    await ensureBucketExists();
    return await minioClient.getObject(BUCKET_NAME, key);
  } catch (error) {
    throw new Error(
      `Failed to get object stream for key '${key}': ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Upload a buffer or stream to MinIO
 */
export async function uploadObject(
  key: string,
  body: Buffer | ReadableStream | Blob,
  contentType: string
): Promise<void> {
  try {
    await ensureBucketExists();

    // Convert body to Buffer if it's a Blob or ReadableStream
    let buffer: Buffer;
    if (body instanceof Buffer) {
      buffer = body;
    } else if (body instanceof Blob) {
      buffer = Buffer.from(await body.arrayBuffer());
    } else {
      // ReadableStream - convert to Buffer
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    }

    const metadata = {
      "Content-Type": contentType,
    };

    await minioClient.putObject(
      BUCKET_NAME,
      key,
      buffer,
      buffer.length,
      metadata
    );
  } catch (error) {
    throw new Error(
      `Failed to upload object to key '${key}': ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Delete an object from MinIO
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await ensureBucketExists();
    await minioClient.removeObject(BUCKET_NAME, key);
  } catch (error) {
    throw new Error(
      `Failed to delete object with key '${key}': ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a unique storage key for an audio file
 * Jobs are global (not tied to projects)
 */
export function generateAudioFileKey(jobId: string, filename: string): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `jobs/${jobId}/uploads/${timestamp}-${sanitizedFilename}`;
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

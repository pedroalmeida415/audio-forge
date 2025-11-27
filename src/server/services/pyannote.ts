import { env } from "~/env";

const PYANNOTE_API_BASE = "https://api.pyannote.ai/v1";

/**
 * Custom error class for Pyannote API errors
 */
export class PyannoteError extends Error {
  statusCode: number;
  retryable: boolean;

  constructor(message: string, statusCode: number, retryable = false) {
    super(message);
    this.name = "PyannoteError";
    this.statusCode = statusCode;
    // Determine if retryable based on status code
    this.retryable = retryable || statusCode === 429 || statusCode >= 500;
  }
}

/**
 * Types for Pyannote API responses
 */
export type PyannoteMediaUploadResponse = {
  url: string; // Presigned upload URL for PUT
};

export type PyannoteDiarizeParams = {
  url: string;
  webhook?: string;
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  confidence?: boolean;
};

export type PyannoteJobResponse = {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
};

export type DiarizationSegment = {
  speaker: string;
  start: number;
  end: number;
};

export type PyannoteJobResult = {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  output?: {
    diarization: DiarizationSegment[];
  };
  error?: string;
};

/**
 * Make an authenticated request to the Pyannote API
 */
async function pyannoteRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${PYANNOTE_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.PYANNOTE_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new PyannoteError(
      `Pyannote API error: ${response.status} - ${errorText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Generate a unique object key for Pyannote media storage
 */
function generateMediaKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `audio-${timestamp}-${random}`;
}

/**
 * Create a pre-signed upload URL for Pyannote's temporary storage
 *
 * Flow:
 * 1. POST to /media/input with a media://object-key URL
 * 2. Receive a presigned URL for PUT upload
 * 3. PUT the file to the presigned URL
 * 4. Use the media://object-key URL in diarization requests
 *
 * @returns Object with presigned upload URL and the media:// URL to use for diarization
 */
export async function createMediaUploadUrl(): Promise<{
  uploadUrl: string;
  mediaUrl: string;
}> {
  const objectKey = generateMediaKey();
  const mediaUrl = `media://${objectKey}`;

  const response = await pyannoteRequest<PyannoteMediaUploadResponse>(
    "/media/input",
    {
      method: "POST",
      body: JSON.stringify({ url: mediaUrl }),
    }
  );

  return {
    uploadUrl: response.url,
    mediaUrl,
  };
}

/**
 * Upload a file to Pyannote's temporary storage using the pre-signed URL
 * Note: This should be called from the server side
 */
export async function uploadToPyannoteStorage(
  uploadUrl: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: fileBuffer,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (!response.ok) {
    throw new PyannoteError(
      `Failed to upload to Pyannote storage: ${response.status}`,
      response.status
    );
  }
}

/**
 * Start a diarization job
 */
export function startDiarization(
  params: PyannoteDiarizeParams
): Promise<PyannoteJobResponse> {
  return pyannoteRequest<PyannoteJobResponse>("/diarize", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Get the status and results of a diarization job
 */
export function getJobStatus(jobId: string): Promise<PyannoteJobResult> {
  return pyannoteRequest<PyannoteJobResult>(`/jobs/${jobId}`);
}

/**
 * Cancel a running diarization job
 */
export function cancelJob(jobId: string): Promise<{ success: boolean }> {
  return pyannoteRequest<{ success: boolean }>(`/jobs/${jobId}`, {
    method: "DELETE",
  });
}

/**
 * Retry wrapper with exponential backoff for Pyannote API calls
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30_000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof PyannoteError) {
        if (!error.retryable || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelayMs * 2 ** attempt + Math.random() * 1000,
          maxDelayMs
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

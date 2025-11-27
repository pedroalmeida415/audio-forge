import { env } from "~/env";

const PYANNOTE_API_BASE = "https://api.pyannote.ai/v1";

/**
 * Custom error class for Pyannote API errors
 */
export class PyannoteError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable = false
  ) {
    super(message);
    this.name = "PyannoteError";
    // Determine if retryable based on status code
    this.retryable = statusCode === 429 || statusCode >= 500;
  }
}

/**
 * Types for Pyannote API responses
 */
export interface PyannoteMediaResponse {
  url: string;
}

export interface PyannoteDiarizeParams {
  url: string;
  webhook?: string;
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  confidence?: boolean;
}

export interface PyannoteJobResponse {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
}

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface PyannoteJobResult {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  output?: {
    diarization: DiarizationSegment[];
  };
  error?: string;
}

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
 * Create a pre-signed upload URL for Pyannote's temporary storage
 */
export async function createMediaUploadUrl(): Promise<PyannoteMediaResponse> {
  return pyannoteRequest<PyannoteMediaResponse>("/media", {
    method: "POST",
  });
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
export async function startDiarization(
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
export async function getJobStatus(jobId: string): Promise<PyannoteJobResult> {
  return pyannoteRequest<PyannoteJobResult>(`/jobs/${jobId}`);
}

/**
 * Cancel a running diarization job
 */
export async function cancelJob(jobId: string): Promise<{ success: boolean }> {
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

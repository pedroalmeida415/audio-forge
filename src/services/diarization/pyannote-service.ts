import { Data, Effect } from "effect";
import { env } from "~/env";

// ============================================================================
// Types
// ============================================================================

export type DiarizationStatus =
  | "pending"
  | "created"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SubmitJobParams {
  audioUrl: string;
  numSpeakers?: number;
  confidence?: boolean;
}

export interface SubmitJobResult {
  jobId: string;
  status: DiarizationStatus;
  warning?: string;
}

export interface JobStatusResult {
  jobId: string;
  status: DiarizationStatus;
  createdAt: string;
  updatedAt: string;
  output?: {
    diarization: DiarizationSegment[];
  };
}

// ============================================================================
// Errors
// ============================================================================

export class PyannoteError extends Data.TaggedError("PyannoteError")<{
  operation: "submit" | "status";
  message: string;
  jobId?: string;
  cause?: unknown;
}> {}

// ============================================================================
// Service
// ============================================================================

const PYANNOTE_API_BASE = "https://api.pyannote.ai/v1";

/**
 * Pyannote API client for speaker diarization.
 *
 * Used to submit audio files for speaker identification and retrieve
 * diarization results. This service is the primary integration point
 * for the diarization feature in the clipping workflow.
 *
 * @see https://docs.pyannote.ai
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const { jobId } = yield* PyannoteService.submitJob({
 *     audioUrl: "https://example.com/audio.mp3",
 *     webhookUrl: "https://myapp.com/webhooks/diarization",
 *   });
 *
 *   const status = yield* PyannoteService.getJobStatus(jobId);
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(PyannoteService.Default)));
 * ```
 */
export class PyannoteService extends Effect.Service<PyannoteService>()(
  "PyannoteService",
  {
    effect: Effect.gen(function* () {
      const apiKey = env.PYANNOTE_API_KEY;
      const webhookUrl = env.PYANNOTE_WEBHOOK_URL;

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      return {
        submitJob: (params: SubmitJobParams) =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(`${PYANNOTE_API_BASE}/diarize`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  url: params.audioUrl,
                  webhook: webhookUrl,
                  numSpeakers: params.numSpeakers,
                  confidence: params.confidence ?? true,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `Pyannote API error: ${response.status} - ${errorText}`,
                );
              }

              return (await response.json()) as SubmitJobResult;
            },
            catch: (error) =>
              new PyannoteError({
                operation: "submit",
                message: "Failed to submit diarization job",
                cause: error,
              }),
          }),

        getJobStatus: (jobId: string) =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `${PYANNOTE_API_BASE}/jobs/${jobId}`,
                {
                  method: "GET",
                  headers,
                },
              );

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `Pyannote API error: ${response.status} - ${errorText}`,
                );
              }

              return (await response.json()) as JobStatusResult;
            },
            catch: (error) =>
              new PyannoteError({
                operation: "status",
                message: "Failed to get diarization job status",
                jobId,
                cause: error,
              }),
          }),
      };
    }),
    accessors: true,
  },
) {}

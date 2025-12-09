import { Effect, Layer } from "effect";
import { env } from "~/env";
import {
  DiarizationService,
  DiarizationStatusError,
  DiarizationSubmitError,
  type JobStatusResult,
  type SubmitJobParams,
  type SubmitJobResult,
} from "./diarization-service";

const PYANNOTE_API_BASE = "https://api.pyannote.ai/v1";

const makeHeaders = () => ({
  Authorization: `Bearer ${env.PYANNOTE_API_KEY}`,
  "Content-Type": "application/json",
});

export const PyannoteServiceLive = Layer.succeed(
  DiarizationService,
  DiarizationService.of({
    submitJob: (params: SubmitJobParams) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${PYANNOTE_API_BASE}/diarize`, {
            method: "POST",
            headers: makeHeaders(),
            body: JSON.stringify({
              url: params.audioUrl,
              webhook: params.webhookUrl,
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
          new DiarizationSubmitError({
            message: "Failed to submit diarization job",
            cause: error,
          }),
      }),
    getJobStatus: (jobId: string) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${PYANNOTE_API_BASE}/jobs/${jobId}`, {
            method: "GET",
            headers: makeHeaders(),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Pyannote API error: ${response.status} - ${errorText}`,
            );
          }

          return (await response.json()) as JobStatusResult;
        },
        catch: (error) =>
          new DiarizationStatusError({
            message: "Failed to get job status",
            jobId,
            cause: error,
          }),
      }),
  }),
);

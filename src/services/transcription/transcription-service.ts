import { Context, Data, Effect, Layer } from "effect";

export interface TranscribeParams {
  audioBuffer: Buffer;
  format: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  confidence?: number;
  durationMs: number;
}

export class TranscriptionService extends Context.Tag("TranscriptionService")<
  TranscriptionService,
  {
    readonly transcribe: (
      params: TranscribeParams,
    ) => Effect.Effect<TranscribeResult, TranscriptionError>;
  }
>() {}

export class TranscriptionError extends Data.TaggedError("TranscriptionError")<{
  message: string;
  cause?: unknown;
}> {}

// Mock implementation
export const MockTranscriptionServiceLive = Layer.succeed(
  TranscriptionService,
  TranscriptionService.of({
    transcribe: (params) =>
      Effect.succeed({
        text: "[Mock transcription - replace with actual service]",
        confidence: 0.95,
        durationMs: params.audioBuffer.length / 100, // Fake duration
      }),
  }),
);

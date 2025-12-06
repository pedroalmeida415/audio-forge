/**
 * Transcription Service
 *
 * Speech-to-text transcription using OpenAI Whisper API.
 * Falls back to placeholder when API key is not configured.
 */

import { Context, Data, Effect, Layer } from "effect";

// ============================================================================
// Errors
// ============================================================================

export class TranscriptionError extends Data.TaggedError("TranscriptionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Service Definition
// ============================================================================

export type TranscriptionInput = {
  readonly audioSource: Buffer;
  readonly language?: string;
  readonly includeTimestamps?: boolean;
};

export type WordTimestamp = {
  readonly word: string;
  readonly start: number;
  readonly end: number;
};

export type TranscriptionResult = {
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly wordTimestamps?: readonly WordTimestamp[];
};

export class TranscriptionService extends Context.Tag("TranscriptionService")<
  TranscriptionService,
  {
    readonly transcribe: (
      input: TranscriptionInput
    ) => Effect.Effect<TranscriptionResult, TranscriptionError>;
    readonly getProviderId: () => string;
  }
>() {}

// ============================================================================
// Whisper Implementation
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function makeWhisperService() {
  return {
    transcribe: (
      input: TranscriptionInput
    ): Effect.Effect<TranscriptionResult, TranscriptionError> =>
      Effect.gen(function* () {
        if (!OPENAI_API_KEY) {
          return yield* Effect.fail(
            new TranscriptionError({
              message: "OPENAI_API_KEY not configured",
            })
          );
        }

        const formData = new FormData();
        formData.append(
          "file",
          new Blob([input.audioSource], { type: "audio/wav" }),
          "audio.wav"
        );
        formData.append("model", "whisper-1");
        formData.append("response_format", input.includeTimestamps ? "verbose_json" : "json");

        if (input.language) {
          formData.append("language", input.language);
        }

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
              },
              body: formData,
            }),
          catch: (error) =>
            new TranscriptionError({
              message: "Failed to call Whisper API",
              cause: error,
            }),
        });

        if (!response.ok) {
          const errorText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => new TranscriptionError({ message: "Failed to read error response" }),
          });
          return yield* Effect.fail(
            new TranscriptionError({
              message: `Whisper API error: ${response.status} - ${errorText}`,
            })
          );
        }

        const data = yield* Effect.tryPromise({
          try: () => response.json() as Promise<{
            text: string;
            language?: string;
            words?: Array<{ word: string; start: number; end: number }>;
          }>,
          catch: (error) =>
            new TranscriptionError({
              message: "Failed to parse Whisper response",
              cause: error,
            }),
        });

        return {
          text: data.text,
          language: data.language ?? input.language ?? "en",
          confidence: 0.9, // Whisper doesn't return confidence
          wordTimestamps: data.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
        };
      }),

    getProviderId: () => "whisper",
  };
}

// ============================================================================
// Placeholder Implementation
// ============================================================================

function makePlaceholderService() {
  return {
    transcribe: (
      input: TranscriptionInput
    ): Effect.Effect<TranscriptionResult, TranscriptionError> =>
      Effect.gen(function* () {
        yield* Effect.sleep("200 millis");

        return {
          text: "[Transcription pending - configure OPENAI_API_KEY]",
          language: input.language ?? "en",
          confidence: 0,
        };
      }),

    getProviderId: () => "placeholder",
  };
}

// ============================================================================
// Layer
// ============================================================================

export const TranscriptionServiceLive = Layer.succeed(
  TranscriptionService,
  OPENAI_API_KEY ? makeWhisperService() : makePlaceholderService()
);

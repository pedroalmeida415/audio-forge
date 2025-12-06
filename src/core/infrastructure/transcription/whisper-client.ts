/**
 * OpenAI Whisper API Client
 *
 * Infrastructure implementation for transcription using OpenAI's Whisper API.
 */

import { Effect } from "effect";
import {
  TranscriptionError,
  TranscriptionProviderUnavailableError,
  UnsupportedLanguageError,
} from "~/core/domain/errors";
import type {
  ProviderInfo,
  TranscribeInput,
  TranscriptionResult,
  WordTimestamp,
} from "~/core/domain/dtos";
import type { LanguageCode } from "~/core/domain/value-objects";

// ============================================================================
// API Response Types (External API shapes)
// ============================================================================

/**
 * OpenAI Whisper API response
 */
type WhisperApiResponse = {
  text: string;
  language?: string;
  duration?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
};

// ============================================================================
// Supported Languages
// ============================================================================

const WHISPER_SUPPORTED_LANGUAGES: readonly LanguageCode[] = [
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl",
  "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu", "is", "id", "it",
  "ja", "kn", "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi", "ne", "no", "fa",
  "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sw", "sv", "tl", "ta", "th",
  "tr", "uk", "ur", "vi", "cy",
];

// ============================================================================
// DTO Mappers
// ============================================================================

/**
 * Maps Whisper API words to domain word timestamps
 */
function mapWordTimestamps(
  words?: WhisperApiResponse["words"]
): readonly WordTimestamp[] | undefined {
  if (!words) return undefined;

  return words.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
}

/**
 * Maps Whisper API response to domain result
 */
function mapToResult(
  response: WhisperApiResponse,
  provider: string,
  startTime: number,
  inputLanguage?: string
): TranscriptionResult {
  return {
    text: response.text,
    language: response.language ?? inputLanguage ?? "en",
    confidence: 0.95, // Whisper generally has high confidence
    wordTimestamps: mapWordTimestamps(response.words),
    durationSeconds: response.duration,
    provider,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// API Client Configuration
// ============================================================================

export type WhisperClientConfig = {
  readonly apiKey?: string;
  readonly model?: string;
};

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Create OpenAI Whisper client
 */
export function createWhisperClient(config: WhisperClientConfig = {}) {
  const { apiKey, model = "whisper-1" } = config;
  const providerId = "openai-whisper";
  const providerName = "OpenAI Whisper";

  const isAvailable = (): Effect.Effect<boolean> =>
    Effect.succeed(!!apiKey || !!process.env.OPENAI_API_KEY);

  const getSupportedLanguages = (): Effect.Effect<readonly LanguageCode[]> =>
    Effect.succeed(WHISPER_SUPPORTED_LANGUAGES);

  const transcribe = (
    input: TranscribeInput
  ): Effect.Effect<
    TranscriptionResult,
    TranscriptionError | TranscriptionProviderUnavailableError | UnsupportedLanguageError
  > =>
    Effect.gen(function* () {
      const effectiveApiKey = apiKey ?? process.env.OPENAI_API_KEY;

      if (!effectiveApiKey) {
        return yield* Effect.fail(
          new TranscriptionProviderUnavailableError({
            provider: providerId,
            message: "OpenAI API key not configured",
          })
        );
      }

      // Validate language if specified
      if (input.language && !WHISPER_SUPPORTED_LANGUAGES.includes(input.language)) {
        return yield* Effect.fail(
          new UnsupportedLanguageError({
            language: input.language,
            supportedLanguages: WHISPER_SUPPORTED_LANGUAGES,
          })
        );
      }

      const startTime = Date.now();

      // Create form data for the API request
      const formData = new FormData();

      if (input.audioSource instanceof Buffer) {
        formData.append(
          "file",
          new Blob([input.audioSource], { type: "audio/wav" }),
          "audio.wav"
        );
      } else {
        // For URL sources, we'd need to fetch first
        // For now, return error
        return yield* Effect.fail(
          new TranscriptionError({
            message: "URL audio sources not yet supported. Please provide a Buffer.",
          })
        );
      }

      formData.append("model", model);

      if (input.language) {
        formData.append("language", input.language);
      }

      if (input.prompt) {
        formData.append("prompt", input.prompt);
      }

      if (input.includeWordTimestamps) {
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${effectiveApiKey}`,
            },
            body: formData,
          }),
        catch: (error) =>
          new TranscriptionError({
            message: "Network error while calling Whisper API",
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
            message: `Whisper API error: ${response.status} ${errorText}`,
          })
        );
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<WhisperApiResponse>,
        catch: (error) =>
          new TranscriptionError({
            message: "Failed to parse Whisper API response",
            cause: error,
          }),
      });

      return mapToResult(data, providerId, startTime, input.language);
    });

  const getProviderInfo = (): Effect.Effect<ProviderInfo> =>
    Effect.gen(function* () {
      const available = yield* isAvailable();
      return {
        id: providerId,
        name: providerName,
        type: "transcription" as const,
        isAvailable: available,
        capabilities: ["transcription", "word_timestamps", "language_detection"],
      };
    });

  return {
    transcribe,
    getSupportedLanguages,
    isAvailable,
    getProviderInfo,
  };
}

// ============================================================================
// Pre-configured Clients
// ============================================================================

/**
 * Default Whisper client using environment variable
 */
export const whisperClient = createWhisperClient();

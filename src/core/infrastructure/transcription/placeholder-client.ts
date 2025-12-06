/**
 * Placeholder Transcription Client
 *
 * Development placeholder that returns a message indicating
 * transcription needs to be configured.
 */

import { Effect } from "effect";
import type {
  ProviderInfo,
  TranscribeInput,
  TranscriptionResult,
} from "~/core/domain/dtos";
import type { LanguageCode } from "~/core/domain/value-objects";

const PROVIDER_ID = "placeholder";
const PROVIDER_NAME = "Placeholder (Configure Whisper API)";

/**
 * Create placeholder transcription client
 */
export function createPlaceholderTranscriptionClient() {
  const isAvailable = (): Effect.Effect<boolean> => Effect.succeed(true);

  const getSupportedLanguages = (): Effect.Effect<readonly LanguageCode[]> =>
    Effect.succeed(["en"]);

  const transcribe = (
    input: TranscribeInput
  ): Effect.Effect<TranscriptionResult> =>
    Effect.gen(function* () {
      // Simulate a small delay
      yield* Effect.sleep("500 millis");

      return {
        text: "[Transcription pending - configure Whisper API]",
        language: input.language ?? "en",
        confidence: 0,
        provider: PROVIDER_ID,
        processingTimeMs: 500,
      };
    });

  const getProviderInfo = (): Effect.Effect<ProviderInfo> =>
    Effect.succeed({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      type: "transcription" as const,
      isAvailable: true,
      capabilities: [],
    });

  return {
    transcribe,
    getSupportedLanguages,
    isAvailable,
    getProviderInfo,
  };
}

/**
 * Default placeholder client
 */
export const placeholderTranscriptionClient = createPlaceholderTranscriptionClient();

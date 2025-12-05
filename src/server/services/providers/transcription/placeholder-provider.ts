/**
 * Placeholder Transcription Provider
 *
 * A placeholder implementation that returns a message indicating
 * the transcription service needs to be configured.
 */

import type { ProviderConfig, ProviderResult } from "../types";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "./types";

const PROVIDER_CONFIG: ProviderConfig = {
  id: "placeholder",
  name: "Placeholder (Configure Whisper API)",
  enabled: true,
};

/**
 * Create a placeholder transcription provider
 */
export function createPlaceholderTranscriptionProvider(): TranscriptionProvider {
  return {
    config: PROVIDER_CONFIG,

    async isAvailable(): Promise<boolean> {
      return true;
    },

    getSupportedLanguages(): string[] {
      return ["en"];
    },

    async transcribe(
      _audioBuffer: Buffer,
      options?: TranscriptionOptions
    ): Promise<ProviderResult<TranscriptionResult>> {
      // Simulate a small delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        success: true,
        data: {
          text: "[Transcription pending - configure Whisper API]",
          language: options?.language ?? "en",
          confidence: 0,
        },
        metadata: {
          provider: PROVIDER_CONFIG.id,
          processingTimeMs: 500,
        },
      };
    },
  };
}

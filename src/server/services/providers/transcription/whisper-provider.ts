/**
 * OpenAI Whisper Transcription Provider
 *
 * Uses the OpenAI Whisper API for high-quality speech-to-text transcription.
 * Requires OPENAI_API_KEY environment variable.
 */

import type { ProviderConfig, ProviderResult } from "../types";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
  WordTimestamp,
} from "./types";

const PROVIDER_CONFIG: ProviderConfig = {
  id: "openai-whisper",
  name: "OpenAI Whisper",
  enabled: true,
};

/**
 * Supported languages by Whisper
 * @see https://platform.openai.com/docs/guides/speech-to-text/supported-languages
 */
const SUPPORTED_LANGUAGES = [
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl",
  "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu", "is", "id", "it",
  "ja", "kn", "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi", "ne", "no", "fa",
  "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sw", "sv", "tl", "ta", "th",
  "tr", "uk", "ur", "vi", "cy",
];

type WhisperResponse = {
  text: string;
  language?: string;
  duration?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
};

/**
 * Create an OpenAI Whisper transcription provider
 */
export function createWhisperTranscriptionProvider(): TranscriptionProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  return {
    config: PROVIDER_CONFIG,

    async isAvailable(): Promise<boolean> {
      return !!apiKey;
    },

    getSupportedLanguages(): string[] {
      return SUPPORTED_LANGUAGES;
    },

    async transcribe(
      audioBuffer: Buffer,
      options?: TranscriptionOptions
    ): Promise<ProviderResult<TranscriptionResult>> {
      if (!apiKey) {
        return {
          success: false,
          error: "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
          metadata: {
            provider: PROVIDER_CONFIG.id,
          },
        };
      }

      const startTime = Date.now();

      try {
        // Create form data for the API request
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([audioBuffer], { type: "audio/wav" }),
          "audio.wav"
        );
        formData.append("model", "whisper-1");

        if (options?.language) {
          formData.append("language", options.language);
        }

        if (options?.prompt) {
          formData.append("prompt", options.prompt);
        }

        // Request word-level timestamps if needed
        if (options?.includeWordTimestamps) {
          formData.append("response_format", "verbose_json");
          formData.append("timestamp_granularities[]", "word");
        }

        const response = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `Whisper API error: ${response.status} ${errorText}`,
            metadata: {
              provider: PROVIDER_CONFIG.id,
            },
          };
        }

        const data = (await response.json()) as WhisperResponse;

        const result: TranscriptionResult = {
          text: data.text,
          language: data.language ?? options?.language ?? "en",
          confidence: 0.95, // Whisper generally has high confidence
          durationSeconds: data.duration,
        };

        if (options?.includeWordTimestamps && data.words) {
          result.wordTimestamps = data.words.map(
            (w): WordTimestamp => ({
              word: w.word,
              start: w.start,
              end: w.end,
            })
          );
        }

        return {
          success: true,
          data: result,
          metadata: {
            provider: PROVIDER_CONFIG.id,
            processingTimeMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          metadata: {
            provider: PROVIDER_CONFIG.id,
          },
        };
      }
    },
  };
}

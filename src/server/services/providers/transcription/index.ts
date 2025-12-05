/**
 * Transcription Provider Factory
 *
 * Creates and manages transcription providers.
 * Currently supports:
 * - placeholder: Returns a placeholder message (default if no API key)
 * - openai-whisper: OpenAI Whisper API (requires OPENAI_API_KEY)
 *
 * Future providers:
 * - local-whisper: Local Whisper.cpp
 * - google-speech: Google Cloud Speech-to-Text
 * - azure-speech: Azure Cognitive Services Speech
 */

import { createPlaceholderTranscriptionProvider } from "./placeholder-provider";
import { createWhisperTranscriptionProvider } from "./whisper-provider";
import type { TranscriptionProvider, TranscriptionProviderId } from "./types";

export type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionProviderId,
  TranscriptionResult,
  WordTimestamp,
} from "./types";

/**
 * Registry of available transcription providers
 */
const providers = new Map<TranscriptionProviderId, () => TranscriptionProvider>();

// Register built-in providers
providers.set("placeholder", createPlaceholderTranscriptionProvider);
providers.set("openai-whisper", createWhisperTranscriptionProvider);

/**
 * Get a transcription provider by ID
 * @param providerId - The provider identifier
 * @returns The transcription provider instance
 */
export function getTranscriptionProvider(
  providerId: TranscriptionProviderId
): TranscriptionProvider {
  const factory = providers.get(providerId);
  if (!factory) {
    throw new Error(`Unknown transcription provider: ${providerId}`);
  }
  return factory();
}

/**
 * Register a custom transcription provider
 * @param providerId - Unique identifier for the provider
 * @param factory - Factory function that creates the provider
 */
export function registerTranscriptionProvider(
  providerId: string,
  factory: () => TranscriptionProvider
): void {
  providers.set(providerId as TranscriptionProviderId, factory);
}

/**
 * Get list of available transcription provider IDs
 */
export function getAvailableTranscriptionProviders(): TranscriptionProviderId[] {
  return Array.from(providers.keys());
}

/**
 * Get the best available transcription provider
 * Prefers OpenAI Whisper if API key is available, otherwise uses placeholder
 */
let defaultProvider: TranscriptionProvider | null = null;

export async function getDefaultTranscriptionProvider(): Promise<TranscriptionProvider> {
  if (!defaultProvider) {
    const whisperProvider = getTranscriptionProvider("openai-whisper");
    const isWhisperAvailable = await whisperProvider.isAvailable();

    if (isWhisperAvailable) {
      defaultProvider = whisperProvider;
    } else {
      defaultProvider = getTranscriptionProvider("placeholder");
    }
  }
  return defaultProvider;
}

/**
 * Get a transcription provider synchronously (for cases where async isn't possible)
 * Uses placeholder if Whisper isn't configured
 */
export function getDefaultTranscriptionProviderSync(): TranscriptionProvider {
  if (process.env.OPENAI_API_KEY) {
    return getTranscriptionProvider("openai-whisper");
  }
  return getTranscriptionProvider("placeholder");
}

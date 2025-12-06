/**
 * Transcription Service Implementation
 *
 * Application layer implementation that provides the TranscriptionService contract
 * using infrastructure clients.
 */

import { Layer } from "effect";
import { TranscriptionService } from "~/core/domain/services";
import { whisperClient, placeholderTranscriptionClient } from "~/core/infrastructure";

// ============================================================================
// Live Layer (Whisper)
// ============================================================================

/**
 * Live Transcription Service Layer using OpenAI Whisper
 */
export const TranscriptionServiceLive = Layer.succeed(TranscriptionService, {
  transcribe: whisperClient.transcribe,
  getSupportedLanguages: whisperClient.getSupportedLanguages,
  isAvailable: whisperClient.isAvailable,
  getProviderInfo: whisperClient.getProviderInfo,
});

// ============================================================================
// Placeholder Layer (Development)
// ============================================================================

/**
 * Placeholder Transcription Service Layer for development/testing
 */
export const TranscriptionServicePlaceholder = Layer.succeed(TranscriptionService, {
  transcribe: placeholderTranscriptionClient.transcribe,
  getSupportedLanguages: placeholderTranscriptionClient.getSupportedLanguages,
  isAvailable: placeholderTranscriptionClient.isAvailable,
  getProviderInfo: placeholderTranscriptionClient.getProviderInfo,
});

// ============================================================================
// Factory for Custom Clients
// ============================================================================

/**
 * Create a Transcription Service Layer from a custom client
 */
export function createTranscriptionServiceLayer(client: {
  readonly transcribe: typeof whisperClient.transcribe;
  readonly getSupportedLanguages: typeof whisperClient.getSupportedLanguages;
  readonly isAvailable: typeof whisperClient.isAvailable;
  readonly getProviderInfo: typeof whisperClient.getProviderInfo;
}) {
  return Layer.succeed(TranscriptionService, {
    transcribe: client.transcribe,
    getSupportedLanguages: client.getSupportedLanguages,
    isAvailable: client.isAvailable,
    getProviderInfo: client.getProviderInfo,
  });
}

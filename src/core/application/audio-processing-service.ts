/**
 * Audio Processing Service Implementation
 *
 * Application layer implementation that provides the AudioProcessingService contract
 * using infrastructure clients.
 */

import { Layer } from "effect";
import { AudioProcessingService } from "~/core/domain/services";
import { placeholderAudioProcessingClient } from "~/core/infrastructure";

// ============================================================================
// Live Layer
// ============================================================================

/**
 * Live Audio Processing Service Layer
 *
 * Uses the placeholder client. Replace with real client when available.
 */
export const AudioProcessingServiceLive = Layer.succeed(AudioProcessingService, {
  process: placeholderAudioProcessingClient.process,
  getSupportedProcessingTypes: placeholderAudioProcessingClient.getSupportedProcessingTypes,
  isAvailable: placeholderAudioProcessingClient.isAvailable,
  getProviderInfo: placeholderAudioProcessingClient.getProviderInfo,
});

// ============================================================================
// Factory for Custom Clients
// ============================================================================

/**
 * Create an Audio Processing Service Layer from a custom client
 */
export function createAudioProcessingServiceLayer(client: {
  readonly process: typeof placeholderAudioProcessingClient.process;
  readonly getSupportedProcessingTypes: typeof placeholderAudioProcessingClient.getSupportedProcessingTypes;
  readonly isAvailable: typeof placeholderAudioProcessingClient.isAvailable;
  readonly getProviderInfo: typeof placeholderAudioProcessingClient.getProviderInfo;
}) {
  return Layer.succeed(AudioProcessingService, {
    process: client.process,
    getSupportedProcessingTypes: client.getSupportedProcessingTypes,
    isAvailable: client.isAvailable,
    getProviderInfo: client.getProviderInfo,
  });
}

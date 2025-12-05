/**
 * Audio Processing Provider Factory
 *
 * Creates and manages audio processing providers.
 * Currently supports:
 * - ffmpeg: FFmpeg-based audio processing (default)
 *
 * Future providers:
 * - demucs: Deep learning-based source separation
 * - resemblyzer: Voice activity detection and speaker diarization
 */

import { createFFmpegAudioProvider } from "./ffmpeg-provider";
import type { AudioProcessingProvider, AudioProcessingProviderId } from "./types";

export type {
  AudioProcessingOptions,
  AudioProcessingParams,
  AudioProcessingProvider,
  AudioProcessingProviderId,
  AudioProcessingResult,
  AudioProcessingType,
} from "./types";

/**
 * Registry of available audio processing providers
 */
const providers = new Map<AudioProcessingProviderId, () => AudioProcessingProvider>();

// Register built-in providers
providers.set("ffmpeg", createFFmpegAudioProvider);

/**
 * Get an audio processing provider by ID
 * @param providerId - The provider identifier (defaults to "ffmpeg")
 * @returns The audio processing provider instance
 */
export function getAudioProcessingProvider(
  providerId: AudioProcessingProviderId = "ffmpeg"
): AudioProcessingProvider {
  const factory = providers.get(providerId);
  if (!factory) {
    throw new Error(`Unknown audio processing provider: ${providerId}`);
  }
  return factory();
}

/**
 * Register a custom audio processing provider
 * @param providerId - Unique identifier for the provider
 * @param factory - Factory function that creates the provider
 */
export function registerAudioProcessingProvider(
  providerId: string,
  factory: () => AudioProcessingProvider
): void {
  providers.set(providerId as AudioProcessingProviderId, factory);
}

/**
 * Get list of available audio processing provider IDs
 */
export function getAvailableAudioProcessingProviders(): AudioProcessingProviderId[] {
  return Array.from(providers.keys());
}

/**
 * Default audio processing provider instance (FFmpeg)
 */
let defaultProvider: AudioProcessingProvider | null = null;

/**
 * Get the default audio processing provider (singleton)
 */
export function getDefaultAudioProcessingProvider(): AudioProcessingProvider {
  if (!defaultProvider) {
    defaultProvider = getAudioProcessingProvider("ffmpeg");
  }
  return defaultProvider;
}

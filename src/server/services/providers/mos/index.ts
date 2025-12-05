/**
 * MOS Provider Factory
 *
 * Creates and manages MOS (Mean Opinion Score) providers.
 * Currently supports:
 * - ffmpeg: FFmpeg-based audio analysis (default)
 *
 * Future providers:
 * - pesq: PESQ (Perceptual Evaluation of Speech Quality)
 * - polqa: POLQA (Perceptual Objective Listening Quality Analysis)
 */

import { createFFmpegMOSProvider } from "./ffmpeg-provider";
import type { MOSProvider, MOSProviderId } from "./types";

export type { MOSOptions, MOSProvider, MOSProviderId, MOSResult } from "./types";

/**
 * Registry of available MOS providers
 */
const providers = new Map<MOSProviderId, () => MOSProvider>();

// Register built-in providers
providers.set("ffmpeg", createFFmpegMOSProvider);

/**
 * Get a MOS provider by ID
 * @param providerId - The provider identifier (defaults to "ffmpeg")
 * @returns The MOS provider instance
 */
export function getMOSProvider(providerId: MOSProviderId = "ffmpeg"): MOSProvider {
  const factory = providers.get(providerId);
  if (!factory) {
    throw new Error(`Unknown MOS provider: ${providerId}`);
  }
  return factory();
}

/**
 * Register a custom MOS provider
 * @param providerId - Unique identifier for the provider
 * @param factory - Factory function that creates the provider
 */
export function registerMOSProvider(
  providerId: string,
  factory: () => MOSProvider
): void {
  providers.set(providerId as MOSProviderId, factory);
}

/**
 * Get list of available MOS provider IDs
 */
export function getAvailableMOSProviders(): MOSProviderId[] {
  return Array.from(providers.keys());
}

/**
 * Default MOS provider instance (FFmpeg)
 */
let defaultProvider: MOSProvider | null = null;

/**
 * Get the default MOS provider (singleton)
 */
export function getDefaultMOSProvider(): MOSProvider {
  if (!defaultProvider) {
    defaultProvider = getMOSProvider("ffmpeg");
  }
  return defaultProvider;
}

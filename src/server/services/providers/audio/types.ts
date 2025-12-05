/**
 * Audio Processing Provider Types
 *
 * Provides audio transformation capabilities including:
 * - Denoise: Remove background noise
 * - Remove BG Music: Isolate voice from background music
 * - Remove Overlap: Remove overlapping speakers
 * - Normalize: Loudness normalization
 * - Upsample: Increase sample rate
 */

import type { AudioFormat, AudioMetadata, BaseProvider, ProviderResult } from "../types";

/**
 * Processing types supported by audio providers
 */
export type AudioProcessingType =
  | "denoise"
  | "remove_bg_music"
  | "remove_overlap"
  | "normalize"
  | "upsample";

/**
 * Parameters for audio processing operations
 */
export type AudioProcessingParams = {
  /** Denoise: Noise reduction amount (0-1) */
  noiseReduction?: number;
  /** Normalize: Target LUFS (e.g., -14) */
  targetLufs?: number;
  /** Normalize: Peak limit in dB (e.g., -1) */
  peakLimit?: number;
  /** Upsample: Target sample rate (e.g., 48000) */
  targetSampleRate?: number;
  /** Remove overlap/bg music: Aggressiveness (0-1) */
  aggressiveness?: number;
};

/**
 * Result of audio processing
 */
export type AudioProcessingResult = {
  /** Processed audio data */
  buffer: Buffer;
  /** Audio metadata */
  metadata: AudioMetadata;
};

/**
 * Options for audio processing
 */
export type AudioProcessingOptions = {
  /** Output format */
  outputFormat?: AudioFormat;
  /** Processing parameters */
  params?: AudioProcessingParams;
};

/**
 * Interface for audio processing providers
 */
export interface AudioProcessingProvider extends BaseProvider {
  /**
   * Process audio with the specified transformation
   * @param audioBuffer - The raw audio data
   * @param processingType - The type of processing to apply
   * @param options - Processing options
   * @returns Promise resolving to processed audio
   */
  process(
    audioBuffer: Buffer,
    processingType: AudioProcessingType,
    options?: AudioProcessingOptions
  ): Promise<ProviderResult<AudioProcessingResult>>;

  /**
   * Apply multiple processing types in sequence
   * @param audioBuffer - The raw audio data
   * @param operations - Array of processing operations
   * @param outputFormat - Final output format
   * @returns Promise resolving to processed audio
   */
  processChain(
    audioBuffer: Buffer,
    operations: Array<{
      type: AudioProcessingType;
      params?: AudioProcessingParams;
    }>,
    outputFormat?: AudioFormat
  ): Promise<ProviderResult<AudioProcessingResult>>;

  /**
   * Get supported processing types for this provider
   */
  getSupportedProcessingTypes(): AudioProcessingType[];
}

/**
 * Audio Processing Provider identifiers
 */
export type AudioProcessingProviderId = "ffmpeg" | "demucs" | "resemblyzer";

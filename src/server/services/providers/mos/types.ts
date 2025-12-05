/**
 * MOS (Mean Opinion Score) Provider Types
 *
 * MOS is a standard measure of audio quality on a scale of 1.0 to 5.0:
 * - 5: Excellent
 * - 4: Good
 * - 3: Fair
 * - 2: Poor
 * - 1: Bad
 */

import type { BaseProvider, ProviderResult } from "../types";

/**
 * Result of MOS calculation
 */
export type MOSResult = {
  /** MOS score from 1.0 to 5.0 */
  score: number;
  /** Breakdown of contributing factors (provider-specific) */
  breakdown?: {
    /** RMS level in dB */
    rmsLevel?: number;
    /** Peak level in dB */
    peakLevel?: number;
    /** Crest factor (peak/RMS ratio) */
    crestFactor?: number;
    /** Whether clipping was detected */
    hasClipping?: boolean;
    /** Number of silence periods detected */
    silenceCount?: number;
  };
  /** Confidence of the score (0-1) */
  confidence?: number;
};

/**
 * Options for MOS calculation
 */
export type MOSOptions = {
  /** Whether to include detailed breakdown in result */
  includeBreakdown?: boolean;
};

/**
 * Interface for MOS estimation providers
 */
export interface MOSProvider extends BaseProvider {
  /**
   * Calculate MOS for an audio buffer
   * @param audioBuffer - The raw audio data
   * @param options - Optional configuration
   * @returns Promise resolving to MOS result
   */
  calculateMOS(
    audioBuffer: Buffer,
    options?: MOSOptions
  ): Promise<ProviderResult<MOSResult>>;
}

/**
 * MOS Provider identifiers
 */
export type MOSProviderId = "ffmpeg" | "pesq" | "polqa";

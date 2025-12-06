/**
 * Domain Value Objects
 *
 * Immutable objects that represent domain concepts.
 * These are used throughout the application to ensure type safety.
 */

// ============================================================================
// Audio Types
// ============================================================================

export type AudioFormat = "mp3" | "wav" | "flac";

export const SUPPORTED_AUDIO_FORMATS: readonly AudioFormat[] = ["mp3", "wav", "flac"];

export type SampleRate = 8000 | 16000 | 22050 | 44100 | 48000 | 96000;

export const SUPPORTED_SAMPLE_RATES: readonly SampleRate[] = [
  8000,
  16000,
  22050,
  44100,
  48000,
  96000,
];

// ============================================================================
// Processing Types
// ============================================================================

export type ProcessingType =
  | "denoise"
  | "remove_bg_music"
  | "remove_overlap"
  | "normalize"
  | "upsample";

export const PROCESSING_TYPES: readonly ProcessingType[] = [
  "denoise",
  "remove_bg_music",
  "remove_overlap",
  "normalize",
  "upsample",
];

export type ProcessingParams = {
  /** Denoise: Noise reduction amount (0-1) */
  readonly noiseReduction?: number;
  /** Normalize: Target LUFS (e.g., -14) */
  readonly targetLufs?: number;
  /** Normalize: Peak limit in dB (e.g., -1) */
  readonly peakLimit?: number;
  /** Upsample: Target sample rate (e.g., 48000) */
  readonly targetSampleRate?: number;
  /** Remove overlap/bg music: Aggressiveness (0-1) */
  readonly aggressiveness?: number;
};

// ============================================================================
// Quality Types
// ============================================================================

/**
 * MOS Score (Mean Opinion Score)
 * Range: 1.0 (bad) to 5.0 (excellent)
 */
export type MOSScore = number;

export const MOS_RANGE = { min: 1.0, max: 5.0 } as const;

/**
 * Confidence score for any computed value
 * Range: 0.0 (no confidence) to 1.0 (full confidence)
 */
export type Confidence = number;

// ============================================================================
// Language Types
// ============================================================================

/**
 * ISO 639-1 language codes
 */
export type LanguageCode = string;

export const COMMON_LANGUAGES: readonly LanguageCode[] = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "zh",
  "ja",
  "ko",
  "ru",
  "ar",
  "hi",
];

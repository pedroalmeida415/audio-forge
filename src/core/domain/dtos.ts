/**
 * Domain DTOs (Data Transfer Objects)
 *
 * These DTOs represent the data shapes that flow between layers.
 * They are used to decouple the infrastructure layer from the domain.
 */

import type {
  AudioFormat,
  Confidence,
  LanguageCode,
  MOSScore,
  ProcessingParams,
  ProcessingType,
} from "./value-objects";

// ============================================================================
// MOS DTOs
// ============================================================================

/**
 * Input for MOS calculation
 */
export type CalculateMOSInput = {
  /** Audio file URL or buffer */
  readonly audioSource: string | Buffer;
};

/**
 * Breakdown of MOS factors (provider-specific)
 */
export type MOSBreakdown = {
  readonly rmsLevel?: number;
  readonly peakLevel?: number;
  readonly crestFactor?: number;
  readonly hasClipping?: boolean;
  readonly silenceCount?: number;
  readonly signalToNoise?: number;
};

/**
 * Result of MOS calculation
 */
export type MOSResult = {
  readonly score: MOSScore;
  readonly confidence: Confidence;
  readonly breakdown?: MOSBreakdown;
  readonly provider: string;
  readonly processingTimeMs: number;
};

// ============================================================================
// Transcription DTOs
// ============================================================================

/**
 * Word-level timing information
 */
export type WordTimestamp = {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly confidence?: Confidence;
};

/**
 * Input for transcription
 */
export type TranscribeInput = {
  /** Audio file URL or buffer */
  readonly audioSource: string | Buffer;
  /** Language code (auto-detect if not specified) */
  readonly language?: LanguageCode;
  /** Whether to include word-level timestamps */
  readonly includeWordTimestamps?: boolean;
  /** Prompt to guide transcription (for context) */
  readonly prompt?: string;
};

/**
 * Result of transcription
 */
export type TranscriptionResult = {
  readonly text: string;
  readonly language: LanguageCode;
  readonly confidence: Confidence;
  readonly wordTimestamps?: readonly WordTimestamp[];
  readonly durationSeconds?: number;
  readonly provider: string;
  readonly processingTimeMs: number;
};

// ============================================================================
// Audio Processing DTOs
// ============================================================================

/**
 * Audio metadata
 */
export type AudioMetadata = {
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly format: AudioFormat;
  readonly fileSizeBytes: number;
  readonly channels?: number;
};

/**
 * Input for audio processing
 */
export type ProcessAudioInput = {
  /** Audio file URL or buffer */
  readonly audioSource: string | Buffer;
  /** Type of processing to apply */
  readonly processingType: ProcessingType;
  /** Processing parameters */
  readonly params?: ProcessingParams;
  /** Output format */
  readonly outputFormat?: AudioFormat;
};

/**
 * Result of audio processing
 */
export type AudioProcessingResult = {
  /** Processed audio as buffer or URL */
  readonly output: Buffer | string;
  /** Audio metadata */
  readonly metadata: AudioMetadata;
  /** MOS score if calculated */
  readonly mosScore?: MOSScore;
  readonly provider: string;
  readonly processingTimeMs: number;
};

// ============================================================================
// Provider Info DTOs
// ============================================================================

/**
 * Information about a provider
 */
export type ProviderInfo = {
  readonly id: string;
  readonly name: string;
  readonly type: "mos" | "transcription" | "audio_processing";
  readonly isAvailable: boolean;
  readonly capabilities?: readonly string[];
};

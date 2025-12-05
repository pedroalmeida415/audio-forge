/**
 * Common types and interfaces for the provider abstraction layer.
 * This enables swapping out implementations for MOS, transcription, and audio processing.
 */

/**
 * Base provider configuration
 */
export type ProviderConfig = {
  /** Unique identifier for this provider */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether this provider is currently enabled */
  enabled: boolean;
};

/**
 * Result of an operation with metadata
 */
export type ProviderResult<T> = {
  success: true;
  data: T;
  metadata?: {
    provider: string;
    processingTimeMs: number;
  };
} | {
  success: false;
  error: string;
  metadata?: {
    provider: string;
  };
};

/**
 * Base interface that all providers must implement
 */
export interface BaseProvider {
  /** Provider configuration */
  readonly config: ProviderConfig;

  /** Check if the provider is available and properly configured */
  isAvailable(): Promise<boolean>;
}

/**
 * Audio format information
 */
export type AudioFormat = "mp3" | "wav" | "flac";

/**
 * Audio metadata returned from processing operations
 */
export type AudioMetadata = {
  durationSeconds: number;
  sampleRate: number;
  format: AudioFormat;
  fileSizeBytes: number;
};

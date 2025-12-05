/**
 * Transcription Provider Types
 *
 * Provides speech-to-text transcription capabilities.
 */

import type { BaseProvider, ProviderResult } from "../types";

/**
 * Word-level timing information
 */
export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
};

/**
 * Result of transcription
 */
export type TranscriptionResult = {
  /** The transcribed text */
  text: string;
  /** Detected or specified language */
  language: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Word-level timestamps if available */
  wordTimestamps?: WordTimestamp[];
  /** Duration of the audio in seconds */
  durationSeconds?: number;
};

/**
 * Options for transcription
 */
export type TranscriptionOptions = {
  /** Language code (e.g., "en", "es", "fr") - if not specified, auto-detect */
  language?: string;
  /** Whether to include word-level timestamps */
  includeWordTimestamps?: boolean;
  /** Prompt to guide transcription (for context) */
  prompt?: string;
};

/**
 * Interface for transcription providers
 */
export interface TranscriptionProvider extends BaseProvider {
  /**
   * Transcribe audio to text
   * @param audioBuffer - The raw audio data
   * @param options - Optional configuration
   * @returns Promise resolving to transcription result
   */
  transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions
  ): Promise<ProviderResult<TranscriptionResult>>;

  /**
   * Get supported languages for this provider
   */
  getSupportedLanguages(): string[];
}

/**
 * Transcription Provider identifiers
 */
export type TranscriptionProviderId =
  | "placeholder"
  | "openai-whisper"
  | "local-whisper"
  | "google-speech"
  | "azure-speech";

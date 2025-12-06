/**
 * Domain Errors
 *
 * These are business-domain errors that represent failures in our domain logic.
 * Using tagged errors allows for precise error handling with Effect.
 */

import { Data } from "effect";

/**
 * Base class for all domain errors
 */
export class DomainError extends Data.TaggedError("DomainError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// MOS (Mean Opinion Score) Errors
// ============================================================================

export class MOSCalculationError extends Data.TaggedError("MOSCalculationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class MOSProviderUnavailableError extends Data.TaggedError(
  "MOSProviderUnavailableError"
)<{
  readonly provider: string;
  readonly message: string;
}> {}

// ============================================================================
// Transcription Errors
// ============================================================================

export class TranscriptionError extends Data.TaggedError("TranscriptionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class TranscriptionProviderUnavailableError extends Data.TaggedError(
  "TranscriptionProviderUnavailableError"
)<{
  readonly provider: string;
  readonly message: string;
}> {}

export class UnsupportedLanguageError extends Data.TaggedError(
  "UnsupportedLanguageError"
)<{
  readonly language: string;
  readonly supportedLanguages: readonly string[];
}> {}

// ============================================================================
// Audio Processing Errors
// ============================================================================

export class AudioProcessingError extends Data.TaggedError(
  "AudioProcessingError"
)<{
  readonly processingType: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AudioProcessingProviderUnavailableError extends Data.TaggedError(
  "AudioProcessingProviderUnavailableError"
)<{
  readonly provider: string;
  readonly message: string;
}> {}

export class InvalidAudioFormatError extends Data.TaggedError(
  "InvalidAudioFormatError"
)<{
  readonly format: string;
  readonly supportedFormats: readonly string[];
}> {}

export class InvalidProcessingParamsError extends Data.TaggedError(
  "InvalidProcessingParamsError"
)<{
  readonly param: string;
  readonly message: string;
}> {}

// ============================================================================
// Storage Errors
// ============================================================================

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly operation: "read" | "write" | "delete";
  readonly key: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly key: string;
}> {}

/**
 * Domain Service Contracts
 *
 * These define the interfaces (ports) for external services.
 * The application layer implements these contracts using the infrastructure layer.
 * This enables dependency inversion - domain doesn't depend on external implementations.
 */

import { Context, Effect } from "effect";
import type {
  AudioProcessingError,
  AudioProcessingProviderUnavailableError,
  InvalidAudioFormatError,
  InvalidProcessingParamsError,
  MOSCalculationError,
  MOSProviderUnavailableError,
  TranscriptionError,
  TranscriptionProviderUnavailableError,
  UnsupportedLanguageError,
} from "./errors";
import type {
  AudioProcessingResult,
  CalculateMOSInput,
  MOSResult,
  ProcessAudioInput,
  ProviderInfo,
  TranscribeInput,
  TranscriptionResult,
} from "./dtos";
import type { LanguageCode, ProcessingType } from "./value-objects";

// ============================================================================
// MOS Service Contract
// ============================================================================

/**
 * MOS (Mean Opinion Score) Service
 *
 * Calculates audio quality scores using external providers.
 * Implementations can use different algorithms (FFmpeg analysis, PESQ, POLQA, etc.)
 */
export class MOSService extends Context.Tag("MOSService")<
  MOSService,
  {
    /**
     * Calculate MOS for an audio source
     */
    readonly calculateMOS: (
      input: CalculateMOSInput
    ) => Effect.Effect<
      MOSResult,
      MOSCalculationError | MOSProviderUnavailableError
    >;

    /**
     * Check if the provider is available
     */
    readonly isAvailable: () => Effect.Effect<boolean>;

    /**
     * Get provider info
     */
    readonly getProviderInfo: () => Effect.Effect<ProviderInfo>;
  }
>() {}

// ============================================================================
// Transcription Service Contract
// ============================================================================

/**
 * Transcription Service
 *
 * Converts speech to text using external providers.
 * Implementations can use Whisper API, Google Speech, Azure, etc.
 */
export class TranscriptionService extends Context.Tag("TranscriptionService")<
  TranscriptionService,
  {
    /**
     * Transcribe audio to text
     */
    readonly transcribe: (
      input: TranscribeInput
    ) => Effect.Effect<
      TranscriptionResult,
      TranscriptionError | TranscriptionProviderUnavailableError | UnsupportedLanguageError
    >;

    /**
     * Get supported languages
     */
    readonly getSupportedLanguages: () => Effect.Effect<readonly LanguageCode[]>;

    /**
     * Check if the provider is available
     */
    readonly isAvailable: () => Effect.Effect<boolean>;

    /**
     * Get provider info
     */
    readonly getProviderInfo: () => Effect.Effect<ProviderInfo>;
  }
>() {}

// ============================================================================
// Audio Processing Service Contract
// ============================================================================

/**
 * Audio Processing Service
 *
 * Processes audio using external providers.
 * Implementations can use various APIs for denoise, normalize, upsample, etc.
 */
export class AudioProcessingService extends Context.Tag("AudioProcessingService")<
  AudioProcessingService,
  {
    /**
     * Process audio with the specified transformation
     */
    readonly process: (
      input: ProcessAudioInput
    ) => Effect.Effect<
      AudioProcessingResult,
      | AudioProcessingError
      | AudioProcessingProviderUnavailableError
      | InvalidAudioFormatError
      | InvalidProcessingParamsError
    >;

    /**
     * Get supported processing types
     */
    readonly getSupportedProcessingTypes: () => Effect.Effect<readonly ProcessingType[]>;

    /**
     * Check if the provider is available
     */
    readonly isAvailable: () => Effect.Effect<boolean>;

    /**
     * Get provider info
     */
    readonly getProviderInfo: () => Effect.Effect<ProviderInfo>;
  }
>() {}

/**
 * Audio Processing API Client
 *
 * Infrastructure implementation for audio processing.
 * This client interacts with external audio processing APIs.
 */

import { Effect } from "effect";
import {
  AudioProcessingError,
  AudioProcessingProviderUnavailableError,
  InvalidAudioFormatError,
  InvalidProcessingParamsError,
} from "~/core/domain/errors";
import type {
  AudioMetadata,
  AudioProcessingResult,
  ProcessAudioInput,
  ProviderInfo,
} from "~/core/domain/dtos";
import {
  type AudioFormat,
  type ProcessingType,
  PROCESSING_TYPES,
  SUPPORTED_AUDIO_FORMATS,
} from "~/core/domain/value-objects";

// ============================================================================
// API Response Types (External API shapes)
// ============================================================================

/**
 * Response from audio processing API
 */
type AudioProcessingApiResponse = {
  /** Base64-encoded audio or URL */
  output: string;
  output_type: "base64" | "url";
  metadata: {
    duration_seconds: number;
    sample_rate: number;
    format: string;
    file_size_bytes: number;
    channels?: number;
  };
  mos_score?: number;
  processing_time_ms?: number;
};

// ============================================================================
// DTO Mappers
// ============================================================================

/**
 * Maps API response metadata to domain metadata
 */
function mapMetadata(apiMetadata: AudioProcessingApiResponse["metadata"]): AudioMetadata {
  return {
    durationSeconds: apiMetadata.duration_seconds,
    sampleRate: apiMetadata.sample_rate,
    format: apiMetadata.format as AudioFormat,
    fileSizeBytes: apiMetadata.file_size_bytes,
    channels: apiMetadata.channels,
  };
}

/**
 * Maps API response to domain result
 */
function mapToResult(
  response: AudioProcessingApiResponse,
  provider: string,
  startTime: number
): AudioProcessingResult {
  const output =
    response.output_type === "base64"
      ? Buffer.from(response.output, "base64")
      : response.output;

  return {
    output,
    metadata: mapMetadata(response.metadata),
    mosScore: response.mos_score,
    provider,
    processingTimeMs: response.processing_time_ms ?? Date.now() - startTime,
  };
}

// ============================================================================
// API Client Configuration
// ============================================================================

export type AudioProcessingApiClientConfig = {
  readonly providerId: string;
  readonly providerName: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly supportedTypes?: readonly ProcessingType[];
};

// ============================================================================
// Validation Helpers
// ============================================================================

function validateFormat(
  format: string | undefined
): Effect.Effect<AudioFormat, InvalidAudioFormatError> {
  const effectiveFormat = format ?? "wav";
  if (!SUPPORTED_AUDIO_FORMATS.includes(effectiveFormat as AudioFormat)) {
    return Effect.fail(
      new InvalidAudioFormatError({
        format: effectiveFormat,
        supportedFormats: SUPPORTED_AUDIO_FORMATS,
      })
    );
  }
  return Effect.succeed(effectiveFormat as AudioFormat);
}

function validateParams(
  input: ProcessAudioInput
): Effect.Effect<void, InvalidProcessingParamsError> {
  const { processingType, params } = input;

  switch (processingType) {
    case "denoise":
      if (params?.noiseReduction !== undefined) {
        if (params.noiseReduction < 0 || params.noiseReduction > 1) {
          return Effect.fail(
            new InvalidProcessingParamsError({
              param: "noiseReduction",
              message: "Must be between 0 and 1",
            })
          );
        }
      }
      break;

    case "normalize":
      if (params?.targetLufs !== undefined) {
        if (params.targetLufs < -60 || params.targetLufs > 0) {
          return Effect.fail(
            new InvalidProcessingParamsError({
              param: "targetLufs",
              message: "Must be between -60 and 0",
            })
          );
        }
      }
      break;

    case "upsample":
      if (params?.targetSampleRate !== undefined) {
        if (params.targetSampleRate < 8000 || params.targetSampleRate > 96000) {
          return Effect.fail(
            new InvalidProcessingParamsError({
              param: "targetSampleRate",
              message: "Must be between 8000 and 96000",
            })
          );
        }
      }
      break;

    case "remove_bg_music":
    case "remove_overlap":
      if (params?.aggressiveness !== undefined) {
        if (params.aggressiveness < 0 || params.aggressiveness > 1) {
          return Effect.fail(
            new InvalidProcessingParamsError({
              param: "aggressiveness",
              message: "Must be between 0 and 1",
            })
          );
        }
      }
      break;
  }

  return Effect.succeed(undefined);
}

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Create Audio Processing API client
 *
 * This is a placeholder implementation that simulates an external API.
 * Replace with actual API calls when integrating with real audio processing services.
 */
export function createAudioProcessingApiClient(config: AudioProcessingApiClientConfig) {
  const {
    providerId,
    providerName,
    baseUrl,
    apiKey,
    supportedTypes = PROCESSING_TYPES,
  } = config;

  const isAvailable = (): Effect.Effect<boolean> =>
    Effect.succeed(true); // Placeholder always available

  const getSupportedProcessingTypes = (): Effect.Effect<readonly ProcessingType[]> =>
    Effect.succeed(supportedTypes);

  const process = (
    input: ProcessAudioInput
  ): Effect.Effect<
    AudioProcessingResult,
    | AudioProcessingError
    | AudioProcessingProviderUnavailableError
    | InvalidAudioFormatError
    | InvalidProcessingParamsError
  > =>
    Effect.gen(function* () {
      // Check availability
      const available = yield* isAvailable();
      if (!available) {
        return yield* Effect.fail(
          new AudioProcessingProviderUnavailableError({
            provider: providerId,
            message: `Audio processing provider ${providerName} is not available`,
          })
        );
      }

      // Validate format
      yield* validateFormat(input.outputFormat);

      // Validate params
      yield* validateParams(input);

      const startTime = Date.now();

      // TODO: Replace with actual API call
      // Example:
      // const response = yield* Effect.tryPromise({
      //   try: () => fetch(`${baseUrl}/process`, {
      //     method: "POST",
      //     headers: {
      //       Authorization: `Bearer ${apiKey}`,
      //       "Content-Type": "application/json",
      //     },
      //     body: JSON.stringify({
      //       audio: input.audioSource instanceof Buffer
      //         ? input.audioSource.toString("base64")
      //         : input.audioSource,
      //       processing_type: input.processingType,
      //       params: input.params,
      //       output_format: input.outputFormat,
      //     }),
      //   }).then(r => r.json() as Promise<AudioProcessingApiResponse>),
      //   catch: (error) => new AudioProcessingError({
      //     processingType: input.processingType,
      //     message: "API request failed",
      //     cause: error,
      //   }),
      // });

      // Placeholder: Simulate API response
      yield* Effect.sleep("200 millis");

      const inputBuffer = input.audioSource instanceof Buffer
        ? input.audioSource
        : Buffer.from("placeholder");

      const simulatedResponse: AudioProcessingApiResponse = {
        output: inputBuffer.toString("base64"),
        output_type: "base64",
        metadata: {
          duration_seconds: 5.0,
          sample_rate: input.params?.targetSampleRate ?? 44100,
          format: input.outputFormat ?? "wav",
          file_size_bytes: inputBuffer.length,
          channels: 1,
        },
        mos_score: 3.8 + Math.random() * 0.5,
        processing_time_ms: Date.now() - startTime,
      };

      return mapToResult(simulatedResponse, providerId, startTime);
    });

  const getProviderInfo = (): Effect.Effect<ProviderInfo> =>
    Effect.succeed({
      id: providerId,
      name: providerName,
      type: "audio_processing" as const,
      isAvailable: true,
      capabilities: supportedTypes.map(String),
    });

  return {
    process,
    getSupportedProcessingTypes,
    isAvailable,
    getProviderInfo,
  };
}

// ============================================================================
// Pre-configured Clients
// ============================================================================

/**
 * Placeholder audio processing client for development
 */
export const placeholderAudioProcessingClient = createAudioProcessingApiClient({
  providerId: "placeholder",
  providerName: "Placeholder Audio Processing (Development)",
});

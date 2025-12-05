/**
 * Processing Providers
 *
 * This module provides a pluggable architecture for audio processing services.
 * Each service type (MOS, Transcription, Audio Processing) has its own provider
 * interface, allowing different implementations to be swapped at runtime.
 *
 * Usage:
 *
 * ```typescript
 * // MOS estimation
 * import { getDefaultMOSProvider } from "~/server/services/providers";
 * const mosProvider = getDefaultMOSProvider();
 * const result = await mosProvider.calculateMOS(audioBuffer);
 *
 * // Transcription
 * import { getDefaultTranscriptionProvider } from "~/server/services/providers";
 * const transcriber = await getDefaultTranscriptionProvider();
 * const result = await transcriber.transcribe(audioBuffer);
 *
 * // Audio processing
 * import { getDefaultAudioProcessingProvider } from "~/server/services/providers";
 * const processor = getDefaultAudioProcessingProvider();
 * const result = await processor.process(audioBuffer, "denoise");
 * ```
 */

// Common types
export type {
  AudioFormat,
  AudioMetadata,
  BaseProvider,
  ProviderConfig,
  ProviderResult,
} from "./types";

// MOS providers
export {
  getAvailableMOSProviders,
  getDefaultMOSProvider,
  getMOSProvider,
  registerMOSProvider,
} from "./mos";
export type { MOSOptions, MOSProvider, MOSProviderId, MOSResult } from "./mos";

// Transcription providers
export {
  getAvailableTranscriptionProviders,
  getDefaultTranscriptionProvider,
  getDefaultTranscriptionProviderSync,
  getTranscriptionProvider,
  registerTranscriptionProvider,
} from "./transcription";
export type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionProviderId,
  TranscriptionResult,
  WordTimestamp,
} from "./transcription";

// Audio processing providers
export {
  getAudioProcessingProvider,
  getAvailableAudioProcessingProviders,
  getDefaultAudioProcessingProvider,
  registerAudioProcessingProvider,
} from "./audio";
export type {
  AudioProcessingOptions,
  AudioProcessingParams,
  AudioProcessingProvider,
  AudioProcessingProviderId,
  AudioProcessingResult,
  AudioProcessingType,
} from "./audio";

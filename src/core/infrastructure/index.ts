/**
 * Infrastructure Layer
 *
 * This layer contains implementations that interact with external systems:
 * - API clients for external services
 * - Database repositories
 * - File storage clients
 *
 * Each implementation follows the contracts defined in the domain layer.
 */

// MOS Clients
export { createMOSApiClient, placeholderMOSClient } from "./mos/api-client";

// Transcription Clients
export {
  createWhisperClient,
  whisperClient,
} from "./transcription/whisper-client";
export {
  createPlaceholderTranscriptionClient,
  placeholderTranscriptionClient,
} from "./transcription/placeholder-client";

// Audio Processing Clients
export {
  createAudioProcessingApiClient,
  placeholderAudioProcessingClient,
} from "./audio-processing/api-client";

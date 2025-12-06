/**
 * Application Layer
 *
 * This layer contains service implementations that wire domain contracts
 * to infrastructure clients. It provides Effect Layers for dependency injection.
 *
 * Usage:
 * ```typescript
 * import { Effect } from "effect";
 * import { MOSService } from "~/core/domain";
 * import { MainLayer } from "~/core/application";
 *
 * const program = Effect.gen(function* () {
 *   const mosService = yield* MOSService;
 *   const result = yield* mosService.calculateMOS({ audioSource: buffer });
 *   return result;
 * });
 *
 * // Run with all services
 * Effect.runPromise(Effect.provide(program, MainLayer));
 * ```
 */

import { Layer } from "effect";

// Service Layers
export {
  MOSServiceLive,
  createMOSServiceLayer,
} from "./mos-service";

export {
  TranscriptionServiceLive,
  TranscriptionServicePlaceholder,
  createTranscriptionServiceLayer,
} from "./transcription-service";

export {
  AudioProcessingServiceLive,
  createAudioProcessingServiceLayer,
} from "./audio-processing-service";

// ============================================================================
// Combined Layers
// ============================================================================

import { MOSServiceLive } from "./mos-service";
import { TranscriptionServiceLive } from "./transcription-service";
import { AudioProcessingServiceLive } from "./audio-processing-service";

/**
 * Main Layer combining all services for production use
 *
 * Provides:
 * - MOSService
 * - TranscriptionService
 * - AudioProcessingService
 */
export const MainLayer = Layer.mergeAll(
  MOSServiceLive,
  TranscriptionServiceLive,
  AudioProcessingServiceLive
);

/**
 * Development Layer using placeholder implementations
 */
import { TranscriptionServicePlaceholder } from "./transcription-service";

export const DevLayer = Layer.mergeAll(
  MOSServiceLive,
  TranscriptionServicePlaceholder,
  AudioProcessingServiceLive
);

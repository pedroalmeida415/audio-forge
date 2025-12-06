/**
 * Processing Services
 *
 * Effect-based services for audio processing, transcription, and MOS scoring.
 * Uses dependency injection for easy testing and swapping implementations.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { MOSService, ProcessingLayer, runService } from "~/services";
 *
 * const program = Effect.gen(function* () {
 *   const mos = yield* MOSService;
 *   return yield* mos.calculate({ audioSource: buffer });
 * });
 *
 * const result = await runService(program);
 * ```
 */

import { Effect, Layer } from "effect";

// Re-export services
export {
  MOSService,
  MOSServiceLive,
  MOSError,
  type MOSInput,
  type MOSResult,
} from "./mos";

export {
  TranscriptionService,
  TranscriptionServiceLive,
  TranscriptionError,
  type TranscriptionInput,
  type TranscriptionResult,
  type WordTimestamp,
} from "./transcription";

export {
  AudioProcessingService,
  AudioProcessingServiceLive,
  AudioProcessingError,
  type ProcessingInput,
  type ProcessingResult,
  type ProcessingType,
  type ProcessingParams,
  type AudioFormat,
} from "./audio-processing";

// ============================================================================
// Combined Layer
// ============================================================================

import { MOSServiceLive } from "./mos";
import { TranscriptionServiceLive } from "./transcription";
import { AudioProcessingServiceLive } from "./audio-processing";

/**
 * Combined layer with all processing services
 */
export const ProcessingLayer = Layer.mergeAll(
  MOSServiceLive,
  TranscriptionServiceLive,
  AudioProcessingServiceLive
);

// ============================================================================
// Runtime Helpers
// ============================================================================

/**
 * Run an Effect program with all services provided
 */
export async function runService<A, E>(
  effect: Effect.Effect<A, E, MOSService | TranscriptionService | AudioProcessingService>
): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, ProcessingLayer));
}

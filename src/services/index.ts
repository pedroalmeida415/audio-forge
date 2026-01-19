import { Layer } from "effect";
import { AudioProcessingService } from "./audio/audio-processing-service";
import { PyannoteService } from "./diarization/pyannote-service";
import { QueueService } from "./queue/queue-service";
import { StorageService } from "./storage/storage-service";

/**
 * Combined layer providing all application services.
 *
 * Each service's .Default layer includes its dependencies,
 * so this composition gives you everything needed to run
 * any Effect that requires these services.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   yield* StorageService.generatePresignedUploadUrl({ ... });
 *   yield* QueueService.enqueue(Queues.WaveformGeneration, { ... });
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(ServicesLive)));
 * ```
 */
export const ServicesLive = Layer.mergeAll(
  StorageService.Default,
  QueueService.Default,
  PyannoteService.Default,
  AudioProcessingService.Default,
);

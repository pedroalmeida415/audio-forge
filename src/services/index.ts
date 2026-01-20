import { Layer, ManagedRuntime } from "effect";
import { AudioProcessingService } from "./audio/audio-processing-service";
import { PyannoteService } from "./diarization/pyannote-service";
import { Database } from "./infra/database";
import { QueueService } from "./queue/queue-service";
import { StorageService } from "./storage/storage-service";

/**
 * Combined layer providing all application services.
 *
 * Each service bundles its own infrastructure dependencies,
 * making composition simple while keeping services self-contained.
 */
export const ServicesLive = Layer.mergeAll(
  Database.Default,
  StorageService.Default,
  QueueService.Default,
  PyannoteService.Default,
  AudioProcessingService.Default,
);

/**
 * Managed runtime for running Effects with all services.
 *
 * This runtime handles the lifecycle of scoped services (S3 client, Redis)
 * and provides a clean API for executing Effects.
 *
 * @example
 * ```ts
 * import { AppRuntime } from "~/services";
 *
 * const result = await AppRuntime.runPromise(
 *   Effect.gen(function* () {
 *     yield* StorageService.generatePresignedUploadUrl({ ... });
 *     yield* QueueService.enqueue(Queues.WaveformGeneration, { ... });
 *   })
 * );
 * ```
 */
export const AppRuntime = ManagedRuntime.make(ServicesLive);

/**
 * Dispose of the app runtime and cleanup resources.
 * Call this during graceful shutdown.
 */
export const disposeRuntime = () => AppRuntime.dispose();

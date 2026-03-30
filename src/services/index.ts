import { Layer, ManagedRuntime } from "effect";
import { AudioProcessingService } from "./audio/audio-processing-service";
import { PyannoteService } from "./diarization/pyannote-service";
import { VibeVoiceService } from "./diarization/vibevoice/vibevoice";
import { Database } from "./infra/database";
import { RedisService } from "./infra/redis";
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
  RedisService.Default,
  StorageService.Default,
  QueueService.Default,
  PyannoteService.Default,
  VibeVoiceService.Default,
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
 *     yield* StorageService.generatePresignedUrl({ ... });
 *     yield* QueueService.enqueue(Queues.WaveformGeneration, { ... });
 *   })
 * );
 * ```
 */
export const AppRuntime = ManagedRuntime.make(ServicesLive);

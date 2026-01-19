import { type JobsOptions, Queue } from "bullmq";
import { Data, Effect } from "effect";
import { RedisService } from "~/services/infra/redis";

// ============================================================================
// Queue Registry - Add new queues here
// ============================================================================

export const Queues = {
  WaveformGeneration: "waveform-generation",
  // Add future queues here:
  // ClipGeneration: "clip-generation",
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

// ============================================================================
// Payload Types - Define payload for each queue
// ============================================================================

export interface WaveformJobPayload {
  fileId: string;
  audioStorageKey: string;
}

// Map queue names to their payload types
export type QueuePayloads = {
  [Queues.WaveformGeneration]: WaveformJobPayload;
  // Add future payload mappings here:
  // [Queues.ClipGeneration]: ClipJobPayload;
};

// ============================================================================
// Result Types
// ============================================================================

export interface EnqueueResult {
  jobId: string;
  queueName: QueueName;
}

export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "prioritized"
  | "unknown";

// ============================================================================
// Errors
// ============================================================================

export class QueueError extends Data.TaggedError("QueueError")<{
  operation: "enqueue" | "getJob" | "getState";
  message: string;
  queueName: QueueName;
  jobId?: string;
  cause?: unknown;
}> {}

// ============================================================================
// Default Queue Options
// ============================================================================

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

// ============================================================================
// Service
// ============================================================================

/**
 * Generic queue service for managing background jobs via BullMQ.
 *
 * Queues are defined in the `Queues` registry. The service lazily creates
 * queue instances as needed and provides generic operations that work
 * across all queue types.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   // Enqueue a job
 *   const { jobId } = yield* QueueService.enqueue(
 *     Queues.WaveformGeneration,
 *     { fileId: "file-123", audioStorageKey: "path/to/audio.mp3" },
 *     { jobId: "file-123" }
 *   );
 *
 *   // Check job state
 *   const state = yield* QueueService.getJobState(Queues.WaveformGeneration, jobId);
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(QueueService.Default)));
 * ```
 */
export class QueueService extends Effect.Service<QueueService>()(
  "QueueService",
  {
    effect: Effect.gen(function* () {
      const redis = yield* RedisService;
      const queues = new Map<QueueName, Queue<unknown>>();

      const getOrCreateQueue = <N extends QueueName>(name: N) =>
        Effect.try({
          try: () => {
            if (!queues.has(name)) {
              queues.set(
                name,
                new Queue(name, {
                  connection: redis,
                  defaultJobOptions: DEFAULT_JOB_OPTIONS,
                }),
              );
            }
            return queues.get(name) as Queue<QueuePayloads[N]>;
          },
          catch: (error) =>
            new QueueError({
              operation: "enqueue",
              message: "Failed to create queue",
              queueName: name,
              cause: error,
            }),
        });

      return {
        enqueue: <N extends QueueName>(
          queueName: QueueName,
          payload: QueuePayloads[N],
          options?: { jobId?: string },
        ) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            const job = yield* Effect.tryPromise({
              try: () =>
                queue.add(queueName, payload, {
                  jobId: options?.jobId,
                }),
              catch: (error) =>
                new QueueError({
                  operation: "enqueue",
                  message: "Failed to enqueue job",
                  queueName,
                  jobId: options?.jobId,
                  cause: error,
                }),
            });

            return {
              jobId: job.id ?? options?.jobId ?? "",
              queueName,
            };
          }),

        getJob: <N extends QueueName>(queueName: N, jobId: string) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            return yield* Effect.tryPromise({
              try: () => queue.getJob(jobId),
              catch: (error) =>
                new QueueError({
                  operation: "getJob",
                  message: "Failed to get job",
                  queueName,
                  jobId,
                  cause: error,
                }),
            });
          }),

        getJobState: (queueName: QueueName, jobId: string) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            const job = yield* Effect.tryPromise({
              try: () => queue.getJob(jobId),
              catch: (error) =>
                new QueueError({
                  operation: "getState",
                  message: "Failed to get job",
                  queueName,
                  jobId,
                  cause: error,
                }),
            });
            if (!job) return null;
            return yield* Effect.tryPromise({
              try: () => job.getState(),
              catch: (error) =>
                new QueueError({
                  operation: "getState",
                  message: "Failed to get job state",
                  queueName,
                  jobId,
                  cause: error,
                }),
            });
          }),

        getQueuePosition: (queueName: QueueName, jobId: string) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            const job = yield* Effect.tryPromise({
              try: () => queue.getJob(jobId),
              catch: (error) =>
                new QueueError({
                  operation: "getState",
                  message: "Failed to get job",
                  queueName,
                  jobId,
                  cause: error,
                }),
            });
            if (!job) return null;

            const state = yield* Effect.tryPromise({
              try: () => job.getState(),
              catch: (error) =>
                new QueueError({
                  operation: "getState",
                  message: "Failed to get job state",
                  queueName,
                  jobId,
                  cause: error,
                }),
            });

            if (state === "waiting") {
              const jobs = yield* Effect.tryPromise({
                try: () => queue.getJobs(["waiting"]),
                catch: (error) =>
                  new QueueError({
                    operation: "getState",
                    message: "Failed to get waiting jobs",
                    queueName,
                    jobId,
                    cause: error,
                  }),
              });
              const index = jobs.findIndex((j) => j.id === jobId);
              return index >= 0 ? index + 1 : null;
            }

            return state === "active" ? 0 : null;
          }),
      };
    }),
    dependencies: [RedisService.Default],
    accessors: true,
  },
) {}

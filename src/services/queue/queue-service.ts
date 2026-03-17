import { type JobsOptions, Queue } from "bullmq";
import { Data, Effect } from "effect";
import { RedisService } from "~/services/infra/redis";

// ============================================================================
// Queue Registry
// ============================================================================

export const Queues = {
  AudioProcessing: "audio-processing",
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

// ============================================================================
// Audio Processing Job Types
// ============================================================================

export const AudioJobs = {
  IngestSource: "ingest_source",
  Diarize: "diarize",
  Denoise: "denoise",
  Transcribe: "transcribe",
  CalculateScore: "calculate_score",
  LJSpeechExport: "ljspeech_export",
} as const;

export type AudioJobName = (typeof AudioJobs)[keyof typeof AudioJobs];

// Job payload - single generic type for all audio jobs
// The job name determines how entryId is interpreted:
// - ingest_source: entryId is sourceId
// - denoise, transcribe: entryId is segmentId (worker ensures clip exists)

/** Payload for all audio processing jobs */
export interface AudioJobPayload {
  entryId: string;
  // Only used by ingest_source jobs.
  queueDiarization?: boolean;
  // Used by denoise/remove_overlap to apply processing on top of existing clip instead of source.
  useExistingClip?: boolean;
}

/** Payload for LJSpeech export jobs */
export interface LJSpeechExportPayload {
  speakerId: string;
  userId: string;
  sampleRate: number;
  minDuration?: number;
  maxDuration?: number;
  minScore?: number;
  maxScore?: number;
}

// ============================================================================
// Result Types
// ============================================================================

export interface EnqueueResult {
  jobId: string;
  queueName: QueueName;
  jobName: string;
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
 * // Enqueue a source ingest job
 * yield* QueueService.enqueueJob(
 *   Queues.AudioProcessing,
 *   AudioJobs.IngestSource,
 *   { entryId: "source-123" }
 * );
 *
 * // Enqueue a batch of transcription jobs
 * yield* QueueService.enqueueJobBatch(
 *   Queues.AudioProcessing,
 *   AudioJobs.Transcribe,
 *   [{ segmentId: "seg-1", ... }, { segmentId: "seg-2", ... }]
 * );
 * ```
 */
export class QueueService extends Effect.Service<QueueService>()(
  "QueueService",
  {
    effect: Effect.gen(function* () {
      const redis = yield* RedisService;
      const queues = new Map<QueueName, Queue<unknown>>();

      const getOrCreateQueue = (name: QueueName) =>
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
            return queues.get(name) as Queue;
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
        /**
         * Enqueue a job to a queue.
         *
         * @param queueName - The target queue from the Queues registry
         * @param jobName - The job type identifier (used by workers to dispatch handlers)
         * @param payload - Job-specific data
         * @param options - Optional job configuration
         * @param options.priority - Lower number = higher priority (default: 0)
         * @returns The job ID and metadata
         */
        enqueueJob: <T>(
          queueName: QueueName,
          jobName: string,
          payload: T,
          options?: { priority?: number },
        ) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            const job = yield* Effect.tryPromise({
              try: () =>
                queue.add(jobName, payload, {
                  priority: options?.priority,
                }),
              catch: (error) =>
                new QueueError({
                  operation: "enqueue",
                  message: `Failed to enqueue ${jobName} job`,
                  queueName,
                  cause: error,
                }),
            });

            return {
              jobId: job.id ?? "",
              queueName,
              jobName,
            } satisfies EnqueueResult;
          }),

        /**
         * Enqueue multiple jobs in a batch (more efficient for bulk operations).
         *
         * @param queueName - The target queue from the Queues registry
         * @param jobName - The job type identifier (used by workers to dispatch handlers)
         * @param payloads - Array of job-specific data
         * @returns Array of job IDs and metadata
         */
        enqueueJobBatch: <T>(
          queueName: QueueName,
          jobName: string,
          payloads: T[],
        ) =>
          Effect.gen(function* () {
            const queue = yield* getOrCreateQueue(queueName);
            const jobs = yield* Effect.tryPromise({
              try: () =>
                queue.addBulk(
                  payloads.map((payload) => ({
                    name: jobName,
                    data: payload,
                  })),
                ),
              catch: (error) =>
                new QueueError({
                  operation: "enqueue",
                  message: `Failed to enqueue batch of ${jobName} jobs`,
                  queueName,
                  cause: error,
                }),
            });

            return jobs.map((job) => ({
              jobId: job.id ?? "",
              queueName,
              jobName,
            })) satisfies EnqueueResult[];
          }),

        /**
         * Get a job by ID.
         *
         * @param queueName - The queue to search in
         * @param jobId - The job ID to retrieve
         * @returns The job instance or undefined if not found
         */
        getJob: (queueName: QueueName, jobId: string) =>
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

        /**
         * Get the current state of a job.
         *
         * @param queueName - The queue containing the job
         * @param jobId - The job ID to check
         * @returns The job state or null if job not found
         */
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

        /**
         * Get the position of a job in the queue.
         *
         * @param queueName - The queue containing the job
         * @param jobId - The job ID to check
         * @returns Position (1-indexed) if waiting, 0 if active, null if not found or completed/failed
         */
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

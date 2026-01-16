import { Queue } from "bullmq";
import { Effect, Layer } from "effect";
import IORedis from "ioredis";
import { env } from "~/env";
import {
  QueueEnqueueError,
  QueueService,
  QueueStatusError,
  type ClipProcessingJobPayload,
  type TranscriptionJobPayload,
  type WaveformJobPayload,
} from "./queue-service";

const REDIS_URL = env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const waveformQueue = new Queue<WaveformJobPayload>("waveform-generation", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

const clipProcessingQueue = new Queue<ClipProcessingJobPayload>(
  "clip-processing",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
);

const transcriptionQueue = new Queue<TranscriptionJobPayload>("transcription", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const BullMQQueueServiceLive = Layer.succeed(
  QueueService,
  QueueService.of({
    enqueueWaveformGeneration: (payload) =>
      Effect.tryPromise({
        try: async () => {
          await waveformQueue.add("generate-waveform", payload, {
            jobId: payload.fileId,
          });

          const waiting = await waveformQueue.getWaitingCount();

          return {
            fileId: payload.fileId,
            position: waiting,
          };
        },
        catch: (error) =>
          new QueueEnqueueError({
            message: "Failed to enqueue waveform generation job",
            cause: error,
          }),
      }),

    getWaveformPosition: (fileId) =>
      Effect.tryPromise({
        try: async () => {
          const job = await waveformQueue.getJob(fileId);
          if (!job) return null;

          const state = await job.getState();
          if (state === "waiting") {
            const jobs = await waveformQueue.getJobs(["waiting"]);
            const index = jobs.findIndex((j) => j.id === fileId);
            return index >= 0 ? index + 1 : null;
          }

          return state === "active" ? 0 : null;
        },
        catch: (error) =>
          new QueueStatusError({
            message: "Failed to get waveform position",
            fileId,
            cause: error,
          }),
      }),

    enqueueClipProcessing: (payload) =>
      Effect.tryPromise({
        try: async () => {
          const jobId = `clip-${payload.segmentId}-${Date.now()}`;
          await clipProcessingQueue.add("process-clip", payload, {
            jobId,
          });

          const waiting = await clipProcessingQueue.getWaitingCount();

          return {
            segmentId: payload.segmentId,
            jobId,
            position: waiting,
          };
        },
        catch: (error) =>
          new QueueEnqueueError({
            message: "Failed to enqueue clip processing job",
            cause: error,
          }),
      }),

    enqueueTranscription: (payload) =>
      Effect.tryPromise({
        try: async () => {
          const jobId = `transcribe-${payload.segmentId}-${Date.now()}`;
          await transcriptionQueue.add("transcribe", payload, {
            jobId,
          });

          const waiting = await transcriptionQueue.getWaitingCount();

          return {
            segmentId: payload.segmentId,
            jobId,
            position: waiting,
          };
        },
        catch: (error) =>
          new QueueEnqueueError({
            message: "Failed to enqueue transcription job",
            cause: error,
          }),
      }),

    getProcessingQueueStatus: () =>
      Effect.tryPromise({
        try: async () => {
          const [
            clipWaiting,
            clipActive,
            transcriptionWaiting,
            transcriptionActive,
          ] = await Promise.all([
            clipProcessingQueue.getWaitingCount(),
            clipProcessingQueue.getActiveCount(),
            transcriptionQueue.getWaitingCount(),
            transcriptionQueue.getActiveCount(),
          ]);

          return {
            clipProcessing: {
              waiting: clipWaiting,
              active: clipActive,
            },
            transcription: {
              waiting: transcriptionWaiting,
              active: transcriptionActive,
            },
          };
        },
        catch: (error) =>
          new QueueStatusError({
            message: "Failed to get processing queue status",
            fileId: "",
            cause: error,
          }),
      }),
  }),
);

import { Queue } from "bullmq";
import { Effect, Layer } from "effect";
import IORedis from "ioredis";
import { env } from "~/env";
import {
  type ClipJobPayload,
  QueueEnqueueError,
  QueueService,
  QueueStatusError,
  type WaveformJobPayload,
} from "./queue-service";

const REDIS_URL = env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const clipQueue = new Queue<ClipJobPayload>("clip-generation", {
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

export const BullMQQueueServiceLive = Layer.succeed(
  QueueService,
  QueueService.of({
    enqueueClipGeneration: (payload) =>
      Effect.tryPromise({
        try: async () => {
          await clipQueue.add("generate-clip", payload, {
            jobId: payload.clipId,
          });

          const waiting = await clipQueue.getWaitingCount();

          return {
            clipId: payload.clipId,
            position: waiting,
          };
        },
        catch: (error) =>
          new QueueEnqueueError({
            message: "Failed to enqueue clip generation job",
            cause: error,
          }),
      }),

    getClipPosition: (clipId) =>
      Effect.tryPromise({
        try: async () => {
          const job = await clipQueue.getJob(clipId);
          if (!job) return null;

          const state = await job.getState();
          if (state === "waiting") {
            const jobs = await clipQueue.getJobs(["waiting"]);
            const index = jobs.findIndex((j) => j.id === clipId);
            return index >= 0 ? index + 1 : null;
          }

          return state === "active" ? 0 : null;
        },
        catch: (error) =>
          new QueueStatusError({
            message: "Failed to get clip position",
            clipId,
            cause: error,
          }),
      }),

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
            clipId: fileId,
            cause: error,
          }),
      }),
  }),
);

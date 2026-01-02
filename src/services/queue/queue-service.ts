import { Context, Data, type Effect } from "effect";

export interface WaveformJobPayload {
  fileId: string;
  audioStorageKey: string;
}

export interface WaveformEnqueueResult {
  fileId: string;
  position: number;
}

export class QueueService extends Context.Tag("QueueService")<
  QueueService,
  {
    readonly enqueueWaveformGeneration: (
      payload: WaveformJobPayload,
    ) => Effect.Effect<WaveformEnqueueResult, QueueEnqueueError>;

    readonly getWaveformPosition: (
      fileId: string,
    ) => Effect.Effect<number | null, QueueStatusError>;
  }
>() {}

export class QueueEnqueueError extends Data.TaggedError("QueueEnqueueError")<{
  message: string;
  cause?: unknown;
}> {}

export class QueueStatusError extends Data.TaggedError("QueueStatusError")<{
  message: string;
  fileId: string;
  cause?: unknown;
}> {}

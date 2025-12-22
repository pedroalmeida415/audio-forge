import { Context, Data, type Effect } from "effect";

export interface ClipJobPayload {
  clipId: string;
  sourceStorageKey: string;
  startTime: number;
  endTime: number;
}

export interface EnqueueResult {
  clipId: string;
  position: number;
}

export class QueueService extends Context.Tag("QueueService")<
  QueueService,
  {
    readonly enqueueClipGeneration: (
      payload: ClipJobPayload,
    ) => Effect.Effect<EnqueueResult, QueueEnqueueError>;

    readonly getClipPosition: (
      clipId: string,
    ) => Effect.Effect<number | null, QueueStatusError>;
  }
>() {}

export class QueueEnqueueError extends Data.TaggedError("QueueEnqueueError")<{
  message: string;
  cause?: unknown;
}> {}

export class QueueStatusError extends Data.TaggedError("QueueStatusError")<{
  message: string;
  clipId: string;
  cause?: unknown;
}> {}

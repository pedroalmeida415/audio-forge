import { Context, Data, type Effect } from "effect";

export interface WaveformJobPayload {
  fileId: string;
  audioStorageKey: string;
}

export interface WaveformEnqueueResult {
  fileId: string;
  position: number;
}

export interface ClipProcessingJobPayload {
  segmentId: string;
  operations: ("generate" | "denoise" | "overlap")[];
}

export interface TranscriptionJobPayload {
  segmentId: string;
  clipStorageKey?: string; // If clip exists, use it; else generate
}

export interface ClipProcessingEnqueueResult {
  segmentId: string;
  jobId: string;
  position: number;
}

export interface TranscriptionEnqueueResult {
  segmentId: string;
  jobId: string;
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

    readonly enqueueClipProcessing: (
      payload: ClipProcessingJobPayload,
    ) => Effect.Effect<ClipProcessingEnqueueResult, QueueEnqueueError>;

    readonly enqueueTranscription: (
      payload: TranscriptionJobPayload,
    ) => Effect.Effect<TranscriptionEnqueueResult, QueueEnqueueError>;

    readonly getProcessingQueueStatus: () => Effect.Effect<
      {
        clipProcessing: { waiting: number; active: number };
        transcription: { waiting: number; active: number };
      },
      QueueStatusError
    >;
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

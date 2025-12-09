import { Context, Data, type Effect } from "effect";

export type DiarizationStatus =
  | "pending"
  | "created"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SubmitJobParams {
  audioUrl: string;
  webhookUrl?: string;
  numSpeakers?: number;
  confidence?: boolean;
}

export interface SubmitJobResult {
  jobId: string;
  status: DiarizationStatus;
  warning?: string;
}

export interface JobStatusResult {
  jobId: string;
  status: DiarizationStatus;
  createdAt: string;
  updatedAt: string;
  output?: {
    diarization: DiarizationSegment[];
  };
}

export class DiarizationService extends Context.Tag("DiarizationService")<
  DiarizationService,
  {
    readonly submitJob: (
      params: SubmitJobParams,
    ) => Effect.Effect<SubmitJobResult, DiarizationSubmitError>;
    readonly getJobStatus: (
      jobId: string,
    ) => Effect.Effect<JobStatusResult, DiarizationStatusError>;
  }
>() {}

export class DiarizationSubmitError extends Data.TaggedError(
  "DiarizationSubmitError",
)<{
  message: string;
  cause?: unknown;
}> {}

export class DiarizationStatusError extends Data.TaggedError(
  "DiarizationStatusError",
)<{
  message: string;
  jobId: string;
  cause?: unknown;
}> {}

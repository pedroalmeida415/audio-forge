import { Context, Data, Effect, Layer } from "effect";

export interface OverlapRemovalParams {
  audioBuffer: Buffer;
  format: string;
}

export interface OverlapRemovalResult {
  audioBuffer: Buffer;
  format: string;
  removedDurationMs: number;
}

export class OverlapRemovalService extends Context.Tag("OverlapRemovalService")<
  OverlapRemovalService,
  {
    readonly removeOverlap: (
      params: OverlapRemovalParams,
    ) => Effect.Effect<OverlapRemovalResult, OverlapRemovalError>;
  }
>() {}

export class OverlapRemovalError extends Data.TaggedError(
  "OverlapRemovalError",
)<{
  message: string;
  cause?: unknown;
}> {}

// Mock implementation - returns input unchanged
export const MockOverlapRemovalServiceLive = Layer.succeed(
  OverlapRemovalService,
  OverlapRemovalService.of({
    removeOverlap: (params) =>
      Effect.succeed({
        audioBuffer: params.audioBuffer,
        format: params.format,
        removedDurationMs: 0,
      }),
  }),
);

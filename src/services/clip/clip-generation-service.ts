import { Context, Data, Effect, Layer } from "effect";

export interface GenerateClipParams {
  sourceStorageKey: string;
  startMs: number;
  endMs: number;
  outputFormat: "flac";
}

export interface GenerateClipResult {
  audioBuffer: Buffer;
  format: string;
  durationMs: number;
}

export class ClipGenerationService extends Context.Tag("ClipGenerationService")<
  ClipGenerationService,
  {
    readonly generateClip: (
      params: GenerateClipParams,
    ) => Effect.Effect<GenerateClipResult, ClipGenerationError>;
  }
>() {}

export class ClipGenerationError extends Data.TaggedError(
  "ClipGenerationError",
)<{
  message: string;
  cause?: unknown;
}> {}

// Mock implementation - returns empty buffer
export const MockClipGenerationServiceLive = Layer.succeed(
  ClipGenerationService,
  ClipGenerationService.of({
    generateClip: (params) =>
      Effect.succeed({
        audioBuffer: Buffer.alloc(0),
        format: params.outputFormat,
        durationMs: params.endMs - params.startMs,
      }),
  }),
);

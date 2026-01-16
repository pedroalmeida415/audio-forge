import { Context, Data, Effect, Layer } from "effect";

export interface DenoiseParams {
  audioBuffer: Buffer;
  format: string;
  strength?: number; // 0-1
}

export interface DenoiseResult {
  audioBuffer: Buffer;
  format: string;
}

export class DenoiseService extends Context.Tag("DenoiseService")<
  DenoiseService,
  {
    readonly denoise: (
      params: DenoiseParams,
    ) => Effect.Effect<DenoiseResult, DenoiseError>;
  }
>() {}

export class DenoiseError extends Data.TaggedError("DenoiseError")<{
  message: string;
  cause?: unknown;
}> {}

// Mock implementation - returns input unchanged
export const MockDenoiseServiceLive = Layer.succeed(
  DenoiseService,
  DenoiseService.of({
    denoise: (params) =>
      Effect.succeed({
        audioBuffer: params.audioBuffer,
        format: params.format,
      }),
  }),
);

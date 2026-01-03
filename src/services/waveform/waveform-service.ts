import { execFile } from "node:child_process";
import path from "node:path";
import { Context, Data, Effect, Layer } from "effect";

/**
 * Result of waveform generation
 */
export interface WaveformResult {
  outputPath: string;
}

/**
 * Error codes for waveform generation failures
 */
export type WaveformErrorCode =
  | "DOCKER_ERROR"
  | "NO_AUDIO"
  | "CORRUPT_FILE"
  | "FILE_NOT_FOUND";

/**
 * Waveform generation error
 */
export class WaveformError extends Data.TaggedError("WaveformError")<{
  message: string;
  code: WaveformErrorCode;
  cause?: unknown;
}> {}

/**
 * Waveform service interface
 */
export class WaveformService extends Context.Tag("WaveformService")<
  WaveformService,
  {
    /**
     * Generate waveform .dat file from audio using audiowaveform via Docker
     * Input and output files must be in the same directory for Docker volume mount
     */
    readonly generateWaveform: (params: {
      inputPath: string;
      outputPath: string;
      samplesPerPixel?: number;
    }) => Effect.Effect<WaveformResult, WaveformError>;
  }
>() {}

/**
 * Run audiowaveform via Docker
 * Both input and output must be in the same directory for volume mounting
 */
function runAudiowaveform(
  inputPath: string,
  outputPath: string,
  samplesPerPixel: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const workDir = path.dirname(inputPath);
    const inputFilename = path.basename(inputPath);
    const outputFilename = path.basename(outputPath);

    // Verify output is in the same directory
    if (path.dirname(outputPath) !== workDir) {
      reject(new Error("Input and output files must be in the same directory"));
      return;
    }

    const args = [
      "run",
      "--rm",
      "-v",
      `${workDir}:/tmp`,
      "-w",
      "/tmp",
      "realies/audiowaveform",
      "-i",
      inputFilename,
      "-o",
      outputFilename,
      "--bits",
      "8",
      "-z",
      samplesPerPixel.toString(),
    ];

    execFile("docker", args, { timeout: 300000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`audiowaveform failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Live implementation of WaveformService
 */
export const WaveformServiceLive = Layer.succeed(
  WaveformService,
  WaveformService.of({
    generateWaveform: ({ inputPath, outputPath, samplesPerPixel = 256 }) =>
      Effect.gen(function* () {
        // Check if input file exists
        const fs = yield* Effect.promise(() => import("node:fs/promises"));
        const inputExists = yield* Effect.tryPromise({
          try: () =>
            fs.access(inputPath).then(
              () => true,
              () => false,
            ),
          catch: () =>
            new WaveformError({
              message: "Failed to check input file",
              code: "FILE_NOT_FOUND",
            }),
        });

        if (!inputExists) {
          return yield* Effect.fail(
            new WaveformError({
              message: `Input file not found: ${inputPath}`,
              code: "FILE_NOT_FOUND",
            }),
          );
        }

        // Run audiowaveform via Docker
        yield* Effect.tryPromise({
          try: () => runAudiowaveform(inputPath, outputPath, samplesPerPixel),
          catch: (error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            // Check for specific error patterns
            if (message.includes("no audio")) {
              return new WaveformError({
                message: "No audio found in file",
                code: "NO_AUDIO",
                cause: error,
              });
            }
            if (
              message.includes("corrupt") ||
              message.includes("Invalid data")
            ) {
              return new WaveformError({
                message: "Audio file appears to be corrupted",
                code: "CORRUPT_FILE",
                cause: error,
              });
            }
            return new WaveformError({
              message: `Waveform generation failed: ${message}`,
              code: "DOCKER_ERROR",
              cause: error,
            });
          },
        });

        return { outputPath };
      }),
  }),
);

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { Data, Effect } from "effect";

// ============================================================================
// Types
// ============================================================================

export interface AudioMetadata {
  durationSeconds: number;
  hasAudio: boolean;
  streams: Array<{
    codec: string;
    channels: number;
    sampleRate: number;
    bitrate?: number;
  }>;
}

export interface ExtractFromVideoResult {
  durationSeconds: number;
  outputPath: string;
}

export interface WaveformResult {
  outputPath: string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  sample_rate?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  format?: {
    duration?: string;
  };
  streams?: FfprobeStream[];
}

// ============================================================================
// Errors
// ============================================================================

export type AudioProcessingErrorCode =
  | "NO_AUDIO"
  | "CORRUPT_FILE"
  | "FFMPEG_ERROR"
  | "FILE_NOT_FOUND"
  | "UNSUPPORTED_FORMAT"
  | "DOCKER_ERROR";

export class AudioProcessingError extends Data.TaggedError(
  "AudioProcessingError",
)<{
  operation: "probe" | "extract" | "convert" | "clip" | "waveform";
  message: string;
  code: AudioProcessingErrorCode;
  cause?: unknown;
}> {}

// ============================================================================
// Internal Effect Wrappers
// ============================================================================

const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;
const FFPROBE_TIMEOUT_MS = 2 * 60 * 1000;
const EXEC_MAX_BUFFER = 10 * 1024 * 1024;

function parseNumericValue(value: string | number | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const runCommand = (params: {
  command: string;
  args: string[];
  timeoutMs: number;
}) =>
  Effect.tryPromise({
    try: async () => {
      return await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          execFile(
            params.command,
            params.args,
            {
              timeout: params.timeoutMs,
              maxBuffer: EXEC_MAX_BUFFER,
            },
            (error, stdout, stderr) => {
              if (error) {
                reject(new Error(stderr || error.message));
                return;
              }

              resolve({ stdout, stderr });
            },
          );
        },
      );
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  });

const runFfprobe = (inputPath: string) =>
  runCommand({
    command: "ffprobe",
    args: [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-print_format",
      "json",
      inputPath,
    ],
    timeoutMs: FFPROBE_TIMEOUT_MS,
  });

const runFfmpeg = (args: string[]) =>
  runCommand({
    command: "ffmpeg",
    args,
    timeoutMs: FFMPEG_TIMEOUT_MS,
  });

const probeFile = (inputPath: string) =>
  Effect.gen(function* () {
    const { stdout } = yield* runFfprobe(inputPath).pipe(
      Effect.catchAll((error) => {
        const message = error.message.toLowerCase();

        if (message.includes("no such file") || message.includes("not found")) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "probe",
              message: `File not found: ${inputPath}`,
              code: "FILE_NOT_FOUND",
              cause: error,
            }),
          );
        }

        if (
          message.includes("invalid data") ||
          message.includes("moov atom not found") ||
          message.includes("corrupt")
        ) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "probe",
              message: "Failed to read media file. It may be corrupted.",
              code: "CORRUPT_FILE",
              cause: error,
            }),
          );
        }

        if (message.includes("timed out")) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "probe",
              message: "Media probe timed out",
              code: "FFMPEG_ERROR",
              cause: error,
            }),
          );
        }

        return Effect.fail(
          new AudioProcessingError({
            operation: "probe",
            message: "Failed to probe media file",
            code: "FFMPEG_ERROR",
            cause: error,
          }),
        );
      }),
    );

    const parsed = yield* Effect.try({
      try: () => JSON.parse(stdout) as FfprobeOutput,
      catch: (error) =>
        new AudioProcessingError({
          operation: "probe",
          message: "Failed to parse ffprobe output",
          code: "FFMPEG_ERROR",
          cause: error,
        }),
    });

    const streams = parsed.streams ?? [];
    const audioStreams = streams
      .filter((stream) => stream.codec_type === "audio")
      .map((stream) => {
        const sampleRate = parseNumericValue(stream.sample_rate);
        const bitrate = parseNumericValue(stream.bit_rate);

        return {
          codec: stream.codec_name ?? "unknown",
          channels: stream.channels ?? 0,
          sampleRate,
          bitrate: bitrate > 0 ? bitrate : undefined,
        };
      });

    return {
      hasAudio: audioStreams.length > 0,
      durationSeconds: parseNumericValue(parsed.format?.duration),
      streams: audioStreams,
    } satisfies AudioMetadata;
  });

const runExtraction = (inputPath: string, outputPath: string) =>
  Effect.gen(function* () {
    yield* runFfmpeg([
      "-y",
      "-nostdin",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "flac",
      "-ac",
      "2",
      "-ar",
      "48000",
      outputPath,
    ]).pipe(
      Effect.catchAll((error) => {
        const message = error.message;
        const lowerMessage = message.toLowerCase();

        if (
          lowerMessage.includes("matches no streams") ||
          lowerMessage.includes("does not contain any stream") ||
          lowerMessage.includes("no audio")
        ) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "extract",
              message: "Video has no audio track",
              code: "NO_AUDIO",
              cause: error,
            }),
          );
        }

        if (
          lowerMessage.includes("invalid data") ||
          lowerMessage.includes("moov atom not found") ||
          lowerMessage.includes("corrupt")
        ) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "extract",
              message: "Failed to read video file. It may be corrupted.",
              code: "CORRUPT_FILE",
              cause: error,
            }),
          );
        }

        if (lowerMessage.includes("timed out")) {
          return Effect.fail(
            new AudioProcessingError({
              operation: "extract",
              message: "Audio extraction timed out",
              code: "FFMPEG_ERROR",
              cause: error,
            }),
          );
        }

        return Effect.fail(
          new AudioProcessingError({
            operation: "extract",
            message: "Failed to extract audio from video",
            code: "FFMPEG_ERROR",
            cause: error,
          }),
        );
      }),
    );

    const metadata = yield* probeFile(outputPath).pipe(
      Effect.mapError(
        (error) =>
          new AudioProcessingError({
            ...error,
            operation: "extract",
            message: "Failed to read extracted audio file",
          }),
      ),
    );

    return metadata.durationSeconds;
  });

const runFlacConversion = (inputPath: string, outputPath: string) =>
  Effect.gen(function* () {
    yield* runFfmpeg([
      "-y",
      "-nostdin",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "flac",
      "-ac",
      "2",
      "-ar",
      "48000",
      outputPath,
    ]).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new AudioProcessingError({
            operation: "convert",
            message: `Failed to convert to FLAC: ${error.message}`,
            code: "FFMPEG_ERROR",
            cause: error,
          }),
        ),
      ),
    );

    const metadata = yield* probeFile(outputPath).pipe(
      Effect.mapError(
        (error) =>
          new AudioProcessingError({
            ...error,
            operation: "convert",
            message: "Failed to read converted FLAC file",
          }),
      ),
    );

    return metadata.durationSeconds;
  });

// ============================================================================
// Service
// ============================================================================

/**
 * Audio processing service for working with audio and video files.
 *
 * Provides functionality to probe media metadata, extract audio from video,
 * convert between formats, and clip audio segments. Uses ffmpeg under the hood.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const metadata = yield* AudioProcessingService.probe({
 *     inputPath: "/path/to/video.mp4",
 *   });
 *
 *   if (metadata.hasAudio) {
 *     const result = yield* AudioProcessingService.extractFromVideo({
 *       inputPath: "/path/to/video.mp4",
 *       outputPath: "/path/to/audio.flac",
 *     });
 *   }
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(AudioProcessingService.Default)));
 * ```
 */
export class AudioProcessingService extends Effect.Service<AudioProcessingService>()(
  "AudioProcessingService",
  {
    succeed: {
      /**
       * Probe a media file to get audio metadata.
       */
      probe: (params: { inputPath: string }) => probeFile(params.inputPath),

      /**
       * Extract audio from a video file to FLAC format.
       * Output is stereo at 48kHz sample rate.
       */
      extractFromVideo: (params: { inputPath: string; outputPath: string }) =>
        Effect.gen(function* () {
          const duration = yield* runExtraction(
            params.inputPath,
            params.outputPath,
          );

          return {
            durationSeconds: duration,
            outputPath: params.outputPath,
          };
        }),

      /**
       * Generate waveform .dat file from audio using audiowaveform via Docker.
       * Input and output files must be in the same directory for Docker volume mount.
       */
      generateWaveform: (params: {
        inputPath: string;
        outputPath: string;
        samplesPerPixel?: number;
      }) =>
        Effect.gen(function* () {
          const inputExists = yield* Effect.async<boolean>((resume) => {
            access(params.inputPath)
              .then(() => resume(Effect.succeed(true)))
              .catch(() => resume(Effect.succeed(false)));
          });

          if (!inputExists) {
            return yield* Effect.fail(
              new AudioProcessingError({
                operation: "waveform",
                message: `Input file not found: ${params.inputPath}`,
                code: "FILE_NOT_FOUND",
              }),
            );
          }

          const workDir = path.dirname(params.inputPath);
          const inputFilename = path.basename(params.inputPath);
          const outputFilename = path.basename(params.outputPath);

          if (path.dirname(params.outputPath) !== workDir) {
            return yield* Effect.fail(
              new AudioProcessingError({
                operation: "waveform",
                message: "Input and output files must be in the same directory",
                code: "DOCKER_ERROR",
              }),
            );
          }

          yield* runCommand({
            command: "docker",
            args: [
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
              (params.samplesPerPixel ?? 256).toString(),
            ],
            timeoutMs: 300000,
          }).pipe(
            Effect.catchAll((error) => {
              const message = error.message;

              if (message.includes("no audio")) {
                return Effect.fail(
                  new AudioProcessingError({
                    operation: "waveform",
                    message: "No audio found in file",
                    code: "NO_AUDIO",
                    cause: error,
                  }),
                );
              }

              if (
                message.includes("corrupt") ||
                message.includes("Invalid data")
              ) {
                return Effect.fail(
                  new AudioProcessingError({
                    operation: "waveform",
                    message: "Audio file appears to be corrupted",
                    code: "CORRUPT_FILE",
                    cause: error,
                  }),
                );
              }

              return Effect.fail(
                new AudioProcessingError({
                  operation: "waveform",
                  message: `Waveform generation failed: ${message}`,
                  code: "DOCKER_ERROR",
                  cause: error,
                }),
              );
            }),
          );

          return { outputPath: params.outputPath };
        }),

      /**
       * Convert an audio file to FLAC format at 48kHz stereo.
       * Used by source ingestion to normalize non-FLAC audio inputs.
       */
      convertToFlac: (params: { inputPath: string; outputPath: string }) =>
        Effect.gen(function* () {
          const durationSeconds = yield* runFlacConversion(
            params.inputPath,
            params.outputPath,
          );

          return {
            outputPath: params.outputPath,
            durationSeconds,
          };
        }),

      /**
       * Convert audio file to WAV format with specified parameters.
       * Used for dataset export (e.g., LJSpeech format).
       */
      convertToWav: (params: {
        inputPath: string;
        outputPath: string;
        sampleRate: number;
        channels: number;
        bitDepth: 16 | 24 | 32;
      }) =>
        Effect.gen(function* () {
          const codecMap: Record<number, string> = {
            16: "pcm_s16le",
            24: "pcm_s24le",
            32: "pcm_s32le",
          };

          const codec = codecMap[params.bitDepth] ?? "pcm_s16le";

          yield* runFfmpeg([
            "-y",
            "-nostdin",
            "-i",
            params.inputPath,
            "-acodec",
            codec,
            "-ac",
            String(params.channels),
            "-ar",
            String(params.sampleRate),
            params.outputPath,
          ]).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new AudioProcessingError({
                  operation: "convert",
                  message: `Failed to convert to WAV: ${error.message}`,
                  code: "FFMPEG_ERROR",
                  cause: error,
                }),
              ),
            ),
          );

          return { outputPath: params.outputPath };
        }),
    },
    accessors: true,
  },
) {}

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { Data, Effect } from "effect";
import ffmpeg from "fluent-ffmpeg";

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

const probeFile = (inputPath: string) =>
  Effect.async<AudioMetadata, AudioProcessingError>((resume) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        resume(
          Effect.fail(
            new AudioProcessingError({
              operation: "probe",
              message: "Failed to probe media file",
              code: "FFMPEG_ERROR",
              cause: err,
            }),
          ),
        );
        return;
      }

      const audioStreams =
        metadata.streams
          ?.filter((s) => s.codec_type === "audio")
          .map((s) => ({
            codec: s.codec_name ?? "unknown",
            channels: s.channels ?? 0,
            sampleRate: s.sample_rate
              ? typeof s.sample_rate === "number"
                ? s.sample_rate
                : Number.parseInt(s.sample_rate, 10)
              : 0,
            bitrate: s.bit_rate
              ? typeof s.bit_rate === "number"
                ? s.bit_rate
                : Number.parseInt(s.bit_rate, 10)
              : undefined,
          })) ?? [];

      resume(
        Effect.succeed({
          hasAudio: audioStreams.length > 0,
          durationSeconds: metadata.format?.duration ?? 0,
          streams: audioStreams,
        }),
      );
    });
  });

const runExtraction = (inputPath: string, outputPath: string) =>
  Effect.async<number, AudioProcessingError>((resume) => {
    let duration = 0;

    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("flac")
      .audioChannels(2)
      .audioFrequency(48000)
      .output(outputPath)
      .on("codecData", (data) => {
        if (data.duration) {
          const parts = data.duration.split(":");
          const [h, m, s] = parts;
          if (h && m && s) {
            const hours = Number.parseFloat(h);
            const minutes = Number.parseFloat(m);
            const seconds = Number.parseFloat(s);
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        }
      })
      .on("end", () => resume(Effect.succeed(duration)))
      .on("error", (err) =>
        resume(
          Effect.fail(
            new AudioProcessingError({
              operation: "extract",
              message: "Failed to extract audio from video",
              code: "FFMPEG_ERROR",
              cause: err,
            }),
          ),
        ),
      )
      .run();
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
          const metadata = yield* probeFile(params.inputPath).pipe(
            Effect.mapError(
              (e) =>
                new AudioProcessingError({
                  ...e,
                  message: "Failed to read video file. It may be corrupted.",
                  code: "CORRUPT_FILE",
                }),
            ),
          );

          if (!metadata.hasAudio) {
            return yield* Effect.fail(
              new AudioProcessingError({
                operation: "extract",
                message: "Video has no audio track",
                code: "NO_AUDIO",
              }),
            );
          }

          const duration = yield* runExtraction(
            params.inputPath,
            params.outputPath,
          );

          return {
            durationSeconds: duration || metadata.durationSeconds,
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

          yield* Effect.async<void, AudioProcessingError>((resume) => {
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
              (params.samplesPerPixel ?? 256).toString(),
            ];

            execFile(
              "docker",
              args,
              { timeout: 300000 },
              (error, _stdout, stderr) => {
                if (error) {
                  const message = stderr || error.message;

                  if (message.includes("no audio")) {
                    resume(
                      Effect.fail(
                        new AudioProcessingError({
                          operation: "waveform",
                          message: "No audio found in file",
                          code: "NO_AUDIO",
                          cause: error,
                        }),
                      ),
                    );
                    return;
                  }

                  if (
                    message.includes("corrupt") ||
                    message.includes("Invalid data")
                  ) {
                    resume(
                      Effect.fail(
                        new AudioProcessingError({
                          operation: "waveform",
                          message: "Audio file appears to be corrupted",
                          code: "CORRUPT_FILE",
                          cause: error,
                        }),
                      ),
                    );
                    return;
                  }

                  resume(
                    Effect.fail(
                      new AudioProcessingError({
                        operation: "waveform",
                        message: `Waveform generation failed: ${message}`,
                        code: "DOCKER_ERROR",
                        cause: error,
                      }),
                    ),
                  );
                  return;
                }

                resume(Effect.void);
              },
            );
          });

          return { outputPath: params.outputPath };
        }),
    },
    accessors: true,
  },
) {}

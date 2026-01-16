import { Context, Data, Effect, Layer } from "effect";
import ffmpeg from "fluent-ffmpeg";

/**
 * Result of audio extraction from video
 */
export interface AudioExtractionResult {
  durationSeconds: number;
  outputPath: string;
}

/**
 * Result of video probing
 */
export interface VideoProbeResult {
  hasAudio: boolean;
  durationSeconds: number;
  audioStreams: Array<{
    codec: string;
    channels: number;
    sampleRate: number;
    bitrate?: number;
  }>;
}

/**
 * Error codes for video extraction failures
 */
export type VideoExtractionErrorCode =
  | "NO_AUDIO"
  | "CORRUPT_FILE"
  | "FFMPEG_ERROR"
  | "UNSUPPORTED_FORMAT";

/**
 * Video extraction error
 */
export class VideoExtractionError extends Data.TaggedError(
  "VideoExtractionError",
)<{
  message: string;
  code: VideoExtractionErrorCode;
  cause?: unknown;
}> {}

/**
 * Video extraction service interface
 */
export class VideoExtractionService extends Context.Tag(
  "VideoExtractionService",
)<
  VideoExtractionService,
  {
    /**
     * Probe a video file to get metadata about audio streams
     */
    readonly probeVideo: (params: {
      inputPath: string;
    }) => Effect.Effect<VideoProbeResult, VideoExtractionError>;

    /**
     * Extract audio from video file to FLAC format
     */
    readonly extractAudio: (params: {
      inputPath: string;
      outputPath: string;
    }) => Effect.Effect<AudioExtractionResult, VideoExtractionError>;
  }
>() {}

/**
 * Probe video using ffprobe
 */
function probeVideoFile(inputPath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
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

      resolve({
        hasAudio: audioStreams.length > 0,
        durationSeconds: metadata.format?.duration ?? 0,
        audioStreams,
      });
    });
  });
}

/**
 * Extract audio from video to FLAC format using ffmpeg
 */
function extractAudioFromVideo(
  inputPath: string,
  outputPath: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let duration = 0;

    ffmpeg(inputPath)
      // Select the best audio stream (ffmpeg does this by default)
      .noVideo()
      // Output to FLAC (lossless) with reasonable settings
      .audioCodec("flac")
      .audioChannels(2) // Stereo
      .audioFrequency(48000) // 48kHz sample rate
      .output(outputPath)
      .on("codecData", (data) => {
        // Parse duration from format like "00:05:23.45"
        if (data.duration) {
          const parts = data.duration.split(":");
          if (parts.length === 3) {
            const [hoursStr, minutesStr, secondsStr] = parts;
            const hours = Number.parseFloat(hoursStr ?? "0");
            const minutes = Number.parseFloat(minutesStr ?? "0");
            const seconds = Number.parseFloat(secondsStr ?? "0");
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        }
      })
      .on("end", () => resolve(duration))
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Live implementation of VideoExtractionService
 */
export const VideoExtractionServiceLive = Layer.succeed(
  VideoExtractionService,
  VideoExtractionService.of({
    probeVideo: ({ inputPath }) =>
      Effect.tryPromise({
        try: () => probeVideoFile(inputPath),
        catch: (error) =>
          new VideoExtractionError({
            message: "Failed to probe video file",
            code: "FFMPEG_ERROR",
            cause: error,
          }),
      }),

    extractAudio: ({ inputPath, outputPath }) =>
      Effect.gen(function* () {
        // First probe to check for audio
        const probeResult = yield* Effect.tryPromise({
          try: () => probeVideoFile(inputPath),
          catch: (error) =>
            new VideoExtractionError({
              message: "Failed to read video file. It may be corrupted.",
              code: "CORRUPT_FILE",
              cause: error,
            }),
        });

        if (!probeResult.hasAudio) {
          return yield* Effect.fail(
            new VideoExtractionError({
              message: "Video has no audio track",
              code: "NO_AUDIO",
            }),
          );
        }

        // Extract audio to FLAC
        const duration = yield* Effect.tryPromise({
          try: () => extractAudioFromVideo(inputPath, outputPath),
          catch: (error) =>
            new VideoExtractionError({
              message: "Failed to extract audio from video",
              code: "FFMPEG_ERROR",
              cause: error,
            }),
        });

        return {
          durationSeconds: duration || probeResult.durationSeconds,
          outputPath,
        };
      }),
  }),
);

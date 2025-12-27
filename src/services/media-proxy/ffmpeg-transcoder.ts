import { spawn } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";

export interface TranscodeOptions {
  inputPath: string;
  startSeconds: number;
  duration: number;
  codec: "aac" | "mp3" | "opus";
  format: "mp4" | "webm" | "mp3";
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
}

export interface TranscodeResult {
  stream: Readable;
  contentType: string;
  cleanup: () => void;
}

/**
 * Get content type for given format
 */
function getContentType(format: string): string {
  switch (format) {
    case "mp4":
      return "audio/mp4";
    case "webm":
      return "audio/webm";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

/**
 * Get FFmpeg codec name for given codec option
 */
function getFFmpegCodec(codec: TranscodeOptions["codec"]): string {
  switch (codec) {
    case "aac":
      return "aac";
    case "mp3":
      return "libmp3lame";
    case "opus":
      return "libopus";
  }
}

/**
 * Transcode a segment of an audio file using FFmpeg
 *
 * Uses fragmented MP4 for MSE compatibility when format is "mp4".
 * Streams output directly without writing to disk.
 */
export function transcodeSegment(options: TranscodeOptions): TranscodeResult {
  const {
    inputPath,
    startSeconds,
    duration,
    codec,
    format,
    bitrate = "128k",
    sampleRate = 44100,
    channels = 2,
  } = options;

  const outputStream = new PassThrough();
  const ffmpegCodec = getFFmpegCodec(codec);
  const contentType = getContentType(format);

  // Build FFmpeg arguments
  // Using -ss before -i for fast seeking (input seeking)
  const args: string[] = [
    "-ss",
    startSeconds.toString(),
    "-i",
    inputPath,
    "-t",
    duration.toString(),
    "-vn", // No video
    "-acodec",
    ffmpegCodec,
    "-b:a",
    bitrate,
    "-ar",
    sampleRate.toString(),
    "-ac",
    channels.toString(),
  ];

  // Add format-specific options
  if (format === "mp4") {
    // Fragmented MP4 for MSE compatibility
    args.push(
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
    );
  } else if (format === "webm") {
    args.push("-f", "webm");
  } else if (format === "mp3") {
    args.push("-f", "mp3");
  }

  // Output to stdout
  args.push("-");

  // Spawn FFmpeg process
  const ffmpegProcess = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Pipe stdout to our output stream
  ffmpegProcess.stdout.pipe(outputStream);

  // Handle stderr (FFmpeg logs to stderr)
  let stderrData = "";
  ffmpegProcess.stderr.on("data", (chunk) => {
    stderrData += chunk.toString();
  });

  // Handle process errors
  ffmpegProcess.on("error", (err) => {
    outputStream.destroy(new Error(`FFmpeg process error: ${err.message}`));
  });

  ffmpegProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
      // FFmpeg exited with error - stream might already be partially sent
      // Log the error but don't necessarily destroy the stream
      console.error(
        `[FFmpeg] Process exited with code ${code}: ${stderrData.slice(-500)}`,
      );
    }
  });

  // Cleanup function to kill FFmpeg if client disconnects
  const cleanup = () => {
    if (!ffmpegProcess.killed) {
      ffmpegProcess.kill("SIGTERM");
    }
  };

  return {
    stream: outputStream,
    contentType,
    cleanup,
  };
}

/**
 * Get audio duration using FFprobe
 */
export async function getAudioDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ];

    const ffprobe = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    ffprobe.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    ffprobe.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = Number.parseFloat(stdout.trim());
        if (Number.isNaN(duration)) {
          reject(new Error(`Invalid duration: ${stdout}`));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
      }
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`FFprobe process error: ${err.message}`));
    });
  });
}

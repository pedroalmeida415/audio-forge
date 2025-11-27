import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

export type ClipExtractionParams = {
  startTime: number;
  endTime: number;
  format?: "mp3" | "wav" | "flac";
};

export type ClipExtractionResult = {
  buffer: Buffer;
  durationSeconds: number;
  format: string;
};

/**
 * Extract an audio clip from a source audio buffer
 * Uses FFmpeg for processing
 */
export function extractClip(
  inputBuffer: Buffer,
  params: ClipExtractionParams
): Promise<ClipExtractionResult> {
  const { startTime, endTime, format = "mp3" } = params;
  const duration = endTime - startTime;

  return new Promise((resolve, reject) => {
    const codecArgs = getCodecArgs(format);

    const ffmpegArgs = [
      "-i",
      "pipe:0", // Read from stdin
      "-ss",
      startTime.toString(), // Start time
      "-t",
      duration.toString(), // Duration
      ...codecArgs,
      "-f",
      format, // Output format
      "pipe:1", // Output to stdout
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    const chunks: Buffer[] = [];
    let stderrOutput = "";

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrOutput}`));
        return;
      }

      const outputBuffer = Buffer.concat(chunks);

      resolve({
        buffer: outputBuffer,
        durationSeconds: duration,
        format,
      });
    });

    // Write input buffer to stdin
    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Extract clip using streams (for larger files)
 */
export function extractClipStream(
  inputStream: Readable,
  params: ClipExtractionParams
): Readable {
  const { startTime, endTime, format = "mp3" } = params;
  const duration = endTime - startTime;

  const codecArgs = getCodecArgs(format);

  const ffmpegArgs = [
    "-i",
    "pipe:0",
    "-ss",
    startTime.toString(),
    "-t",
    duration.toString(),
    ...codecArgs,
    "-f",
    format,
    "pipe:1",
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  inputStream.pipe(ffmpeg.stdin);

  ffmpeg.on("error", (err) => {
    ffmpeg.stdout.destroy(err);
  });

  return ffmpeg.stdout;
}

/**
 * Get FFmpeg codec arguments for the specified format
 */
function getCodecArgs(format: string): string[] {
  switch (format) {
    case "mp3":
      return ["-acodec", "libmp3lame", "-q:a", "2"];
    case "wav":
      return ["-acodec", "pcm_s16le"];
    case "flac":
      return ["-acodec", "flac"];
    default:
      return ["-acodec", "libmp3lame", "-q:a", "2"];
  }
}

/**
 * Get audio duration using FFprobe
 */
export function getAudioDuration(inputBuffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      "-i",
      "pipe:0",
    ]);

    let output = "";
    let stderrOutput = "";

    ffprobe.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`FFprobe process error: ${err.message}`));
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}: ${stderrOutput}`));
        return;
      }

      const duration = Number.parseFloat(output.trim());
      if (Number.isNaN(duration)) {
        reject(new Error("Could not parse duration from FFprobe output"));
        return;
      }

      resolve(duration);
    });

    ffprobe.stdin.write(inputBuffer);
    ffprobe.stdin.end();
  });
}

/**
 * Get detailed audio metadata using FFprobe
 */
export function getAudioMetadata(inputBuffer: Buffer): Promise<{
  duration: number;
  sampleRate: number;
  channels: number;
}> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=sample_rate,channels:format=duration",
      "-of",
      "json",
      "-i",
      "pipe:0",
    ]);

    let output = "";
    let stderrOutput = "";

    ffprobe.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`FFprobe process error: ${err.message}`));
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}: ${stderrOutput}`));
        return;
      }

      try {
        const data = JSON.parse(output) as {
          streams?: Array<{ sample_rate?: string; channels?: number }>;
          format?: { duration?: string };
        };
        const stream = data.streams?.[0];
        const format = data.format;

        resolve({
          duration: Number.parseFloat(format?.duration ?? "0"),
          sampleRate: Number.parseInt(stream?.sample_rate ?? "44100", 10),
          channels: stream?.channels ?? 2,
        });
      } catch {
        reject(new Error("Could not parse FFprobe JSON output"));
      }
    });

    ffprobe.stdin.write(inputBuffer);
    ffprobe.stdin.end();
  });
}

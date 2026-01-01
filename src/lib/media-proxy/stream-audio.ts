import { spawn } from "node:child_process";
import { Readable } from "node:stream";

interface StreamAudioOptions {
  localPath: string;
  startMs: number;
  endMs: number;
  bitrate?: string;
}

/**
 * Stream a slice of audio as fMP4 (fragmented MP4) for MSE compatibility
 *
 * Uses FFmpeg with flags optimized for streaming:
 * - frag_keyframe: Fragment at each keyframe
 * - empty_moov: No samples in moov (init segment only)
 * - default_base_moof: Required for MSE
 */
export function streamAudioSlice(options: StreamAudioOptions): Response {
  const { localPath, startMs, endMs, bitrate = "128k" } = options;
  const durationMs = endMs - startMs;

  // Convert ms to seconds with 3 decimal places for FFmpeg
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = (durationMs / 1000).toFixed(3);

  // FFmpeg args for fMP4 streaming
  // -ss before -i for fast seeking (input seeking)
  const args = [
    "-ss", startSec,
    "-i", localPath,
    "-t", durationSec,
    "-c:a", "aac",
    "-b:a", bitrate,
    "-f", "mp4",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-", // Output to stdout
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Convert Node stream to Web ReadableStream
  const nodeStream = ffmpeg.stdout;

  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (err) => {
        console.error("[stream-audio] Stream error:", err);
        controller.error(err);
      });
    },
    cancel() {
      ffmpeg.kill("SIGTERM");
    },
  });

  // Log FFmpeg errors (but don't fail the stream)
  let stderrOutput = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[stream-audio] FFmpeg exited with code ${code}`);
      console.error(`[stream-audio] stderr: ${stderrOutput}`);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("[stream-audio] FFmpeg spawn error:", err);
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "audio/mp4",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "none",
    },
  });
}

/**
 * Stream entire audio file as fMP4 (for clips that don't need slicing)
 */
export function streamFullAudio(options: {
  localPath: string;
  bitrate?: string;
}): Response {
  const { localPath, bitrate = "128k" } = options;

  const args = [
    "-i", localPath,
    "-c:a", "aac",
    "-b:a", bitrate,
    "-f", "mp4",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-",
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const nodeStream = ffmpeg.stdout;

  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (err) => {
        console.error("[stream-audio] Stream error:", err);
        controller.error(err);
      });
    },
    cancel() {
      ffmpeg.kill("SIGTERM");
    },
  });

  ffmpeg.stderr.on("data", () => {
    // Suppress FFmpeg stderr output unless debugging
  });

  ffmpeg.on("error", (err) => {
    console.error("[stream-audio] FFmpeg spawn error:", err);
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "audio/mp4",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "none",
    },
  });
}

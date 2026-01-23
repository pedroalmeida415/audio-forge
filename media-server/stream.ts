import { spawn } from "node:child_process";
import { createReadStream, statSync } from "node:fs";

interface StreamSliceOptions {
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
export function streamAudioSlice(options: StreamSliceOptions): Response {
  const { localPath, startMs, endMs, bitrate = "128k" } = options;
  const durationMs = endMs - startMs;

  // Convert ms to seconds with 3 decimal places for FFmpeg
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = (durationMs / 1000).toFixed(3);

  // FFmpeg args for fMP4 streaming
  // -ss before -i for fast seeking (input seeking)
  const args = [
    "-ss",
    startSec,
    "-i",
    localPath,
    "-t",
    durationSec,
    "-c:a",
    "aac",
    "-b:a",
    bitrate,
    "-f",
    "mp4",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
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
 * Extract a slice as FLAC and return as a complete buffer (for workers).
 * Since clips are short (typically 20-30s), buffering is simpler and faster
 * than streaming for these small files.
 */
export async function extractFlacSlice(options: {
  localPath: string;
  startMs: number;
  endMs: number;
}): Promise<Response> {
  const { localPath, startMs, endMs } = options;
  const durationMs = endMs - startMs;

  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = (durationMs / 1000).toFixed(3);

  const args = [
    "-ss",
    startSec,
    "-i",
    localPath,
    "-t",
    durationSec,
    "-c:a",
    "flac",
    "-f",
    "flac",
    "-",
  ];

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on("data", () => {
      // Suppress FFmpeg stderr
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        resolve(
          new Response(JSON.stringify({ error: "FFmpeg extraction failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
        return;
      }

      const buffer = Buffer.concat(chunks);
      resolve(
        new Response(buffer, {
          headers: {
            "Content-Type": "audio/flac",
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "private, max-age=3600",
          },
        }),
      );
    });

    ffmpeg.on("error", (err) => {
      console.error("[stream-audio] FFmpeg spawn error:", err);
      resolve(
        new Response(JSON.stringify({ error: "FFmpeg spawn failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  });
}

/**
 * Stream the raw file without transcoding (for workers)
 * Returns the file as-is, preserving original format (usually FLAC)
 */
export function streamRawFile(options: { localPath: string }): Response {
  const { localPath } = options;

  // Get file size for Content-Length header
  const stats = statSync(localPath);
  const fileSize = stats.size;

  // Create a readable stream from the file
  const nodeStream = createReadStream(localPath);

  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (err) => {
        console.error("[stream-audio] Raw stream error:", err);
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  // Infer content type from file extension
  const ext = localPath.split(".").pop()?.toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === "flac") {
    contentType = "audio/flac";
  } else if (ext === "wav") {
    contentType = "audio/wav";
  } else if (ext === "mp3") {
    contentType = "audio/mpeg";
  }

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileSize.toString(),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

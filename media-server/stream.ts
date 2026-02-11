import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Temp directory for FFmpeg output files.
 * Uses /dev/shm (tmpfs/RAM-backed) to avoid disk I/O.
 * Falls back to OS temp dir if /dev/shm is not available.
 *
 * Note: /dev/shm is cleared on reboot and shared with other processes.
 * Files are deleted immediately after use, so memory pressure is minimal.
 */
const TEMP_DIR = (() => {
  const baseDir = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
  const dir = join(baseDir, "audio-forge");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
})();

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
 * Uses a temp file so FFmpeg can finalize the FLAC header with correct metadata
 * (duration, total samples, etc.). Piping to stdout leaves these as placeholders.
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

  // Use a temp file so FFmpeg can seek back and finalize the FLAC header
  const tempPath = join(TEMP_DIR, `flac-slice-${Date.now()}-${Math.random().toString(36).slice(2)}.flac`);

  const args = [
    "-ss",
    startSec,
    "-i",
    localPath,
    "-t",
    durationSec,
    "-c:a",
    "flac",
    "-y", // Overwrite temp file if exists
    tempPath,
  ];

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        console.error("[extractFlacSlice] FFmpeg failed:", stderrOutput);
        // Clean up temp file on error
        try {
          rmSync(tempPath, { force: true });
        } catch {}
        resolve(
          new Response(JSON.stringify({ error: "FFmpeg extraction failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
        return;
      }

      try {
        // Read the complete FLAC file with proper headers
        const buffer = readFileSync(tempPath);
        // Clean up temp file
        rmSync(tempPath, { force: true });

        resolve(
          new Response(buffer, {
            headers: {
              "Content-Type": "audio/flac",
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "private, max-age=3600",
            },
          }),
        );
      } catch (err) {
        console.error("[extractFlacSlice] Failed to read temp file:", err);
        resolve(
          new Response(JSON.stringify({ error: "Failed to read extracted audio" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    ffmpeg.on("error", (err) => {
      console.error("[extractFlacSlice] FFmpeg spawn error:", err);
      // Clean up temp file on error
      try {
        rmSync(tempPath, { force: true });
      } catch {}
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
      nodeStream.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk as Buffer));
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

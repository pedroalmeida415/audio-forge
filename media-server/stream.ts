import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Temp directory for FFmpeg output files.
 * Uses /dev/shm (tmpfs/RAM-backed) to avoid disk I/O.
 * Falls back to OS temp dir if /dev/shm is not available.
 *
 * Note: /dev/shm is cleared on reboot and shared with other processes.
 */
const TEMP_DIR = (() => {
  const baseDir = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
  const dir = join(baseDir, "audio-forge");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
})();

export interface ProcessAudioOptions {
  localPath: string;
  start?: number;
  end?: number;
  format?: string;
  sampleRate?: number;
  signal?: AbortSignal;
}

export interface ProcessAudioResult {
  stream: ReadableStream;
  contentType: string;
}

/**
 * Handle audio processing, slicing, and transcoding.
 *
 * If the format is stdout-friendly (e.g., fmp4, mp3), leverages Bun.spawn to stream
 * FFmpeg stdout optimally with native backpressure.
 *
 * For formats that require finalized headers (e.g., flac, wav), uses a temporary
 * file in /dev/shm, waits for completion, reads into memory, and cleans up immediately.
 */
export async function processAudio(
  options: ProcessAudioOptions,
): Promise<ProcessAudioResult> {
  const { localPath, start, end, format, sampleRate } = options;

  const requiresSlicing = start !== undefined && end !== undefined;
  const outputFormat = format || "flac";

  const args: string[] = ["-hide_banner", "-loglevel", "error"];

  // Fast-seek input: -ss before -i
  if (requiresSlicing) {
    args.push("-ss", start.toFixed(6), "-t", (end - start).toFixed(6));
  }

  args.push("-i", localPath);

  // Resample if requested (before codec/format args)
  if (sampleRate) {
    args.push("-ar", String(sampleRate));
  }

  let contentType = "application/octet-stream";

  if (outputFormat === "fmp4") {
    contentType = "audio/mp4";
    args.push(
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
    );
  } else if (outputFormat === "flac") {
    contentType = "audio/flac";
    args.push("-c:a", "flac", "-f", "flac");
  } else if (outputFormat === "wav") {
    contentType = "audio/wav";
    args.push("-c:a", "pcm_s16le", "-f", "wav");
  } else if (outputFormat === "mp3") {
    contentType = "audio/mpeg";
    args.push("-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3");
  } else {
    // Fallback format
    contentType = "audio/mpeg";
    args.push("-f", outputFormat);
  }

  // Formats that require seeking back to finalize headers (cannot pipe to stdout safely)
  const requiresTempFile = outputFormat === "flac" || outputFormat === "wav";
  if (!requiresTempFile) {
    // Stream output directly
    args.push("-");

    const proc = Bun.spawn(["ffmpeg", ...args], {
      stderr: "ignore",
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => proc.kill());
    }

    return {
      stream: proc.stdout,
      contentType,
    };
  }

  const tempPath = join(
    TEMP_DIR,
    `slice-${Date.now()}-${Math.random().toString(36).slice(2)}.${outputFormat}`,
  );
  args.push("-y", tempPath);

  const proc = Bun.spawn(["ffmpeg", ...args], {
    stderr: "pipe",
  });

  const abortHandler = () => proc.kill();
  if (options.signal) {
    options.signal.addEventListener("abort", abortHandler);
  }

  const code = await proc.exited;

  if (options.signal) {
    options.signal.removeEventListener("abort", abortHandler);
  }

  if (code !== 0) {
    const errText = await new Response(proc.stderr).text();
    console.error("[processAudio] FFmpeg failed:", errText);
    try {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    } catch {}
    throw new Error("FFmpeg processing failed");
  }

  try {
    // We grab the native readable stream from Bun.file
    const fileStream = Bun.file(tempPath).stream();

    // We create a TransformStream to act as a pure passthrough pipe.
    // This allows us to intercept the exact moment the stream natively finishes,
    // closes, or errors without buffering any bytes in memory or breaking backpressure.
    const cleanupTransform = new TransformStream({
      flush() {
        // Stream completed successfully
        try {
          if (existsSync(tempPath)) rmSync(tempPath, { force: true });
        } catch {}
      },
    });

    // Make sure to clean up if the client disconnects or an error is thrown during streaming
    fileStream.pipeTo(cleanupTransform.writable).catch((err) => {
      console.error("[processAudio] Stream aborted/errored:", err);
      try {
        if (existsSync(tempPath)) rmSync(tempPath, { force: true });
      } catch {}
    });

    return {
      stream: cleanupTransform.readable,
      contentType,
    };
  } catch (err) {
    console.error("[processAudio] Failed to read temp file:", err);
    try {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    } catch {}
    throw new Error("Failed to read processed audio");
  }
}

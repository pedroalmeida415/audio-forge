import { spawn } from "node:child_process";
import type { Writable } from "node:stream";

// ============================================================================
// Types
// ============================================================================

export type AudioFormat = "wav" | "flac" | "mp3";
export type SampleRate = 8000 | 16000 | 22050 | 44100 | 48000;
export type BitDepth = 16 | 24;
export type Channels = 1 | 2;

export interface ConvertOptions {
  /** Target audio format */
  format: AudioFormat;
  /** Target sample rate in Hz */
  sampleRate: SampleRate;
  /** Bit depth (only used for WAV) */
  bitDepth?: BitDepth;
  /** Number of channels (1 = mono, 2 = stereo) */
  channels: Channels;
}

export interface ConvertResult {
  /** Converted audio data */
  buffer: Buffer;
  /** MIME type for the output format */
  mimeType: string;
  /** File extension (without dot) */
  extension: string;
}

// ============================================================================
// Constants
// ============================================================================

const MIME_TYPES: Record<AudioFormat, string> = {
  wav: "audio/wav",
  flac: "audio/flac",
  mp3: "audio/mpeg",
};

/**
 * Map bit depth to FFmpeg sample format string
 * s16 = signed 16-bit PCM
 * s24 = signed 24-bit PCM (packed in 32-bit container for some codecs)
 */
const BIT_DEPTH_TO_SAMPLE_FMT: Record<BitDepth, string> = {
  16: "s16",
  24: "s24",
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build FFmpeg arguments for audio conversion
 */
function buildFFmpegArgs(options: ConvertOptions): string[] {
  const { format, sampleRate, bitDepth = 16, channels } = options;

  // Common input args: read from stdin (pipe:0)
  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0", // Read from stdin
    "-ar",
    sampleRate.toString(), // Sample rate
    "-ac",
    channels.toString(), // Channels
  ];

  switch (format) {
    case "wav": {
      // WAV with PCM encoding
      // -sample_fmt specifies the bit depth
      const sampleFmt = BIT_DEPTH_TO_SAMPLE_FMT[bitDepth];
      args.push(
        "-c:a",
        "pcm_s16le", // 16-bit uses pcm_s16le
        "-sample_fmt",
        sampleFmt,
        "-f",
        "wav",
      );
      // For 24-bit, use pcm_s24le
      if (bitDepth === 24) {
        args[args.indexOf("pcm_s16le")] = "pcm_s24le";
      }
      break;
    }

    case "mp3": {
      // MP3 with libmp3lame encoder, high quality
      args.push("-c:a", "libmp3lame", "-b:a", "320k", "-f", "mp3");
      break;
    }

    case "flac": {
      // FLAC output - lossless, respects sample rate and channels
      args.push(
        "-c:a",
        "flac",
        "-compression_level",
        "8", // Higher compression
        "-f",
        "flac",
      );
      break;
    }
  }

  // Output to stdout
  args.push("pipe:1");

  return args;
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Convert audio buffer from FLAC to target format using FFmpeg.
 *
 * This function spawns FFmpeg as a child process, pipes the input buffer
 * to stdin, and collects the output from stdout.
 *
 * @param input - Input audio buffer (expected to be FLAC)
 * @param options - Conversion options (format, sample rate, bit depth, channels)
 * @returns Promise resolving to conversion result with buffer, MIME type, and extension
 *
 * @example
 * ```typescript
 * const flacBuffer = await fs.readFile("clip.flac");
 * const result = await convertAudio(flacBuffer, {
 *   format: "wav",
 *   sampleRate: 22050,
 *   bitDepth: 16,
 *   channels: 1,
 * });
 * // result.buffer contains WAV data
 * // result.mimeType is "audio/wav"
 * // result.extension is "wav"
 * ```
 */
export async function convertAudio(
  input: Buffer,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const args = buildFFmpegArgs(options);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const outputChunks: Buffer[] = [];
    let stderrOutput = "";

    // Collect output from stdout
    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      outputChunks.push(chunk);
    });

    // Collect errors from stderr
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `FFmpeg exited with code ${code}: ${stderrOutput || "Unknown error"}`,
          ),
        );
        return;
      }

      const outputBuffer = Buffer.concat(outputChunks);
      resolve({
        buffer: outputBuffer,
        mimeType: MIME_TYPES[options.format],
        extension: options.format,
      });
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });

    // Write input buffer to stdin and close it
    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}

/**
 * Convert audio buffer with streaming support.
 *
 * Returns a readable stream that can be piped directly to a response
 * or other writable stream, useful for large files where buffering
 * the entire output is not desirable.
 *
 * @param input - Input audio buffer or readable stream
 * @param options - Conversion options
 * @returns Object with readable stream and metadata
 *
 * @example
 * ```typescript
 * const { stream, mimeType } = convertAudioStream(flacBuffer, {
 *   format: "wav",
 *   sampleRate: 22050,
 *   bitDepth: 16,
 *   channels: 1,
 * });
 *
 * return new Response(stream, {
 *   headers: { "Content-Type": mimeType },
 * });
 * ```
 */
export function convertAudioStream(
  input: Buffer | NodeJS.ReadableStream,
  options: ConvertOptions,
): {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  extension: string;
} {
  const args = buildFFmpegArgs(options);

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Log FFmpeg errors but don't fail the stream
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    console.error("[ffmpeg-convert]", chunk.toString());
  });

  ffmpeg.on("error", (err) => {
    console.error("[ffmpeg-convert] FFmpeg spawn error:", err);
  });

  // Pipe input to FFmpeg stdin
  if (Buffer.isBuffer(input)) {
    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  } else {
    input.pipe(ffmpeg.stdin as Writable);
  }

  return {
    stream: ffmpeg.stdout,
    mimeType: MIME_TYPES[options.format],
    extension: options.format,
  };
}

/**
 * Convert audio and return a Web ReadableStream.
 *
 * This is useful for Next.js API routes that require Web streams
 * instead of Node.js streams.
 *
 * @param input - Input audio buffer
 * @param options - Conversion options
 * @returns Object with Web ReadableStream and metadata
 */
export function convertAudioToWebStream(
  input: Buffer,
  options: ConvertOptions,
): {
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
  extension: string;
} {
  const {
    stream: nodeStream,
    mimeType,
    extension,
  } = convertAudioStream(input, options);

  // Convert Node stream to Web ReadableStream
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  return {
    stream: webStream,
    mimeType,
    extension,
  };
}

/**
 * FFmpeg Audio Processing Provider
 *
 * Provides audio processing using FFmpeg with various filters:
 * - Denoise: afftdn (FFT-based denoiser)
 * - Remove BG Music: highpass/lowpass + compression
 * - Remove Overlap: agate + de-clicking
 * - Normalize: loudnorm (EBU R128)
 * - Upsample: aresample with SoX resampler
 */

import { spawn } from "node:child_process";
import type { AudioFormat, AudioMetadata, ProviderConfig, ProviderResult } from "../types";
import type {
  AudioProcessingOptions,
  AudioProcessingParams,
  AudioProcessingProvider,
  AudioProcessingResult,
  AudioProcessingType,
} from "./types";

const PROVIDER_CONFIG: ProviderConfig = {
  id: "ffmpeg",
  name: "FFmpeg Audio Processing",
  enabled: true,
};

/**
 * Build FFmpeg filter chain based on processing type
 */
function buildFilterChain(
  processingType: AudioProcessingType,
  params: AudioProcessingParams = {}
): string[] {
  const filters: string[] = [];

  switch (processingType) {
    case "denoise": {
      // Use afftdn (FFT-based denoiser) for noise reduction
      // nr: noise reduction amount (0-97, we map 0-1 to 0-50)
      const noiseReduction = Math.round((params.noiseReduction ?? 0.5) * 50);
      filters.push(`afftdn=nr=${noiseReduction}:nf=-25:tn=1`);
      break;
    }

    case "remove_bg_music": {
      // Use highpass and lowpass to focus on speech frequencies
      // Speech is typically 300Hz-3400Hz, but we use a wider range for quality
      const aggressiveness = params.aggressiveness ?? 0.5;
      const lowCut = Math.round(80 + aggressiveness * 120); // 80-200 Hz
      const highCut = Math.round(8000 - aggressiveness * 3000); // 5000-8000 Hz

      filters.push(`highpass=f=${lowCut}`);
      filters.push(`lowpass=f=${highCut}`);

      // Apply mild compression to even out levels
      filters.push("acompressor=threshold=-20dB:ratio=3:attack=5:release=50");
      break;
    }

    case "remove_overlap": {
      // Use a gate to remove quiet overlapping voices
      // and enhance the primary speaker
      const aggressiveness = params.aggressiveness ?? 0.5;
      const threshold = -30 + aggressiveness * 15; // -30 to -15 dB

      // Noise gate to cut quiet sounds
      filters.push(
        `agate=threshold=${threshold}dB:ratio=2:attack=5:release=100`
      );

      // Apply mild de-essing to reduce sibilance from overlaps
      filters.push("adeclick=w=10:o=75");
      break;
    }

    case "normalize": {
      // Use loudnorm for EBU R128 loudness normalization
      const targetLufs = params.targetLufs ?? -14;
      const peakLimit = params.peakLimit ?? -1;

      filters.push(
        `loudnorm=I=${targetLufs}:TP=${peakLimit}:LRA=11:print_format=none`
      );
      break;
    }

    case "upsample": {
      // Resample to target sample rate with high-quality interpolation
      const targetSampleRate = params.targetSampleRate ?? 48_000;

      // Use sinc interpolation for high-quality resampling
      filters.push(`aresample=${targetSampleRate}:resampler=soxr:precision=33`);
      break;
    }
  }

  return filters;
}

/**
 * Get FFmpeg codec arguments for the specified format
 */
function getCodecArgs(format: AudioFormat): string[] {
  switch (format) {
    case "mp3":
      return ["-acodec", "libmp3lame", "-q:a", "2"];
    case "wav":
      return ["-acodec", "pcm_s16le"];
    case "flac":
      return ["-acodec", "flac"];
    default:
      return ["-acodec", "pcm_s16le"];
  }
}

/**
 * Process audio using FFmpeg
 */
async function processWithFFmpeg(
  inputBuffer: Buffer,
  filterChain: string[],
  outputFormat: AudioFormat,
  targetSampleRate?: number
): Promise<{ buffer: Buffer; durationSeconds: number; sampleRate: number }> {
  return new Promise((resolve, reject) => {
    const codecArgs = getCodecArgs(outputFormat);

    const ffmpegArgs = [
      "-i",
      "pipe:0",
      ...(filterChain.length > 0 ? ["-af", filterChain.join(",")] : []),
      ...codecArgs,
      "-f",
      outputFormat,
      "pipe:1",
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

      // Extract duration and sample rate from stderr
      const durationMatch = stderrOutput.match(
        /Duration: (\d+):(\d+):(\d+\.\d+)/
      );
      const sampleRateMatch = stderrOutput.match(/(\d+) Hz/);

      const durationSeconds = durationMatch
        ? Number.parseInt(durationMatch[1]) * 3600 +
          Number.parseInt(durationMatch[2]) * 60 +
          Number.parseFloat(durationMatch[3])
        : 0;

      const sampleRate = sampleRateMatch
        ? Number.parseInt(sampleRateMatch[1])
        : (targetSampleRate ?? 44_100);

      resolve({
        buffer: outputBuffer,
        durationSeconds,
        sampleRate,
      });
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Create an FFmpeg audio processing provider
 */
export function createFFmpegAudioProvider(): AudioProcessingProvider {
  return {
    config: PROVIDER_CONFIG,

    async isAvailable(): Promise<boolean> {
      return new Promise((resolve) => {
        const ffmpeg = spawn("ffmpeg", ["-version"]);
        ffmpeg.on("error", () => resolve(false));
        ffmpeg.on("close", (code) => resolve(code === 0));
      });
    },

    getSupportedProcessingTypes(): AudioProcessingType[] {
      return ["denoise", "remove_bg_music", "remove_overlap", "normalize", "upsample"];
    },

    async process(
      audioBuffer: Buffer,
      processingType: AudioProcessingType,
      options?: AudioProcessingOptions
    ): Promise<ProviderResult<AudioProcessingResult>> {
      const startTime = Date.now();
      const outputFormat = options?.outputFormat ?? "wav";
      const params = options?.params ?? {};

      try {
        const filterChain = buildFilterChain(processingType, params);
        const result = await processWithFFmpeg(
          audioBuffer,
          filterChain,
          outputFormat,
          params.targetSampleRate
        );

        const metadata: AudioMetadata = {
          durationSeconds: result.durationSeconds,
          sampleRate: result.sampleRate,
          format: outputFormat,
          fileSizeBytes: result.buffer.length,
        };

        return {
          success: true,
          data: {
            buffer: result.buffer,
            metadata,
          },
          metadata: {
            provider: PROVIDER_CONFIG.id,
            processingTimeMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          metadata: {
            provider: PROVIDER_CONFIG.id,
          },
        };
      }
    },

    async processChain(
      audioBuffer: Buffer,
      operations: Array<{
        type: AudioProcessingType;
        params?: AudioProcessingParams;
      }>,
      outputFormat: AudioFormat = "wav"
    ): Promise<ProviderResult<AudioProcessingResult>> {
      const startTime = Date.now();

      try {
        let currentBuffer = audioBuffer;
        let result: { buffer: Buffer; durationSeconds: number; sampleRate: number } | null = null;

        for (const operation of operations) {
          const filterChain = buildFilterChain(operation.type, operation.params);
          result = await processWithFFmpeg(
            currentBuffer,
            filterChain,
            outputFormat,
            operation.params?.targetSampleRate
          );
          currentBuffer = result.buffer;
        }

        if (!result) {
          return {
            success: false,
            error: "No processing operations provided",
            metadata: {
              provider: PROVIDER_CONFIG.id,
            },
          };
        }

        const metadata: AudioMetadata = {
          durationSeconds: result.durationSeconds,
          sampleRate: result.sampleRate,
          format: outputFormat,
          fileSizeBytes: result.buffer.length,
        };

        return {
          success: true,
          data: {
            buffer: result.buffer,
            metadata,
          },
          metadata: {
            provider: PROVIDER_CONFIG.id,
            processingTimeMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          metadata: {
            provider: PROVIDER_CONFIG.id,
          },
        };
      }
    },
  };
}

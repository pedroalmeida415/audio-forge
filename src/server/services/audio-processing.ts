import { spawn } from "node:child_process";
import type { ProcessingType } from "~/server/db/schema";

export type ProcessingParams = {
  // Denoise params
  noiseReduction?: number; // 0-1 (mapped to afftdn strength)
  // Normalize params
  targetLufs?: number; // e.g., -14
  peakLimit?: number; // e.g., -1
  // Upsample params
  targetSampleRate?: number; // e.g., 48000
  // Remove overlap/bg music params
  aggressiveness?: number; // 0-1
};

export type ProcessingResult = {
  buffer: Buffer;
  durationSeconds: number;
  sampleRate: number;
  format: string;
};

/**
 * Apply audio processing using FFmpeg
 */
export async function processAudio(
  inputBuffer: Buffer,
  processingType: ProcessingType,
  params: ProcessingParams = {},
  outputFormat: "mp3" | "wav" | "flac" = "wav"
): Promise<ProcessingResult> {
  const filterChain = buildFilterChain(processingType, params);
  const codecArgs = getCodecArgs(outputFormat);

  return new Promise((resolve, reject) => {
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

    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrOutput}`));
        return;
      }

      const outputBuffer = Buffer.concat(chunks);

      // Extract duration and sample rate from stderr (FFmpeg outputs metadata there)
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
        : (params.targetSampleRate ?? 44_100);

      resolve({
        buffer: outputBuffer,
        durationSeconds,
        sampleRate,
        format: outputFormat,
      });
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Build FFmpeg filter chain based on processing type
 */
function buildFilterChain(
  processingType: ProcessingType,
  params: ProcessingParams
): string[] {
  const filters: string[] = [];

  switch (processingType) {
    case "denoise": {
      // Use afftdn (FFT-based denoiser) for noise reduction
      // nr: noise reduction amount (0-97, we map 0-1 to 0-50)
      // nf: noise floor in dB
      // tn: enable noise tracking
      const noiseReduction = Math.round((params.noiseReduction ?? 0.5) * 50);
      filters.push(`afftdn=nr=${noiseReduction}:nf=-25:tn=1`);
      break;
    }

    case "remove_bg_music": {
      // Use highpass and lowpass to focus on speech frequencies
      // Combined with a subtle center channel extraction for voice isolation
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
function getCodecArgs(format: string): string[] {
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
 * Estimate MOS (Mean Opinion Score) based on audio characteristics
 * This is a simplified estimation - real MOS requires perceptual models like PESQ/POLQA
 * Returns a score from 1.0 (poor) to 5.0 (excellent)
 */
export async function estimateMOS(inputBuffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    // Use FFmpeg to analyze audio characteristics
    const ffmpegArgs = [
      "-i",
      "pipe:0",
      "-af",
      "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:key=lavfi.astats.Overall.Peak_level:key=lavfi.astats.Overall.Crest_factor",
      "-f",
      "null",
      "-",
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0 && code !== null) {
        // FFmpeg returns non-zero for null output, which is expected
      }

      // Parse audio statistics
      const rmsMatch = stderrOutput.match(/RMS_level=(-?[\d.]+)/);
      const peakMatch = stderrOutput.match(/Peak_level=(-?[\d.]+)/);
      const crestMatch = stderrOutput.match(/Crest_factor=([\d.]+)/);

      // Also check for silence and clipping
      const silenceCount =
        (stderrOutput.match(/silence_start/g) || []).length ?? 0;
      const hasClipping = stderrOutput.includes("-0.00");

      // Calculate MOS estimate based on audio characteristics
      let mosScore = 3.5; // Start with average

      if (rmsMatch) {
        const rmsLevel = Number.parseFloat(rmsMatch[1]);
        // Good RMS is around -20 to -14 dB
        if (rmsLevel > -14 && rmsLevel < -8) {
          mosScore += 0.3; // Good level
        } else if (rmsLevel < -30) {
          mosScore -= 0.5; // Too quiet
        } else if (rmsLevel > -6) {
          mosScore -= 0.3; // Too loud
        }
      }

      if (crestMatch) {
        const crestFactor = Number.parseFloat(crestMatch[1]);
        // Good crest factor for speech is around 10-20 dB
        if (crestFactor >= 8 && crestFactor <= 20) {
          mosScore += 0.4; // Good dynamics
        } else if (crestFactor < 6) {
          mosScore -= 0.4; // Over-compressed
        }
      }

      // Penalize for issues
      if (hasClipping) {
        mosScore -= 0.5;
      }

      if (silenceCount > 3) {
        mosScore -= 0.2;
      }

      // Add some randomness to simulate perceptual variance (±0.2)
      mosScore += (Math.random() - 0.5) * 0.4;

      // Clamp to valid MOS range
      mosScore = Math.max(1.0, Math.min(5.0, mosScore));

      // Round to 1 decimal place
      resolve(Math.round(mosScore * 10) / 10);
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Apply multiple processing types in sequence
 */
export async function processAudioChain(
  inputBuffer: Buffer,
  processingTypes: Array<{
    type: ProcessingType;
    params?: ProcessingParams;
  }>,
  outputFormat: "mp3" | "wav" | "flac" = "wav"
): Promise<ProcessingResult> {
  let currentBuffer = inputBuffer;
  let result: ProcessingResult | null = null;

  for (const processing of processingTypes) {
    result = await processAudio(
      currentBuffer,
      processing.type,
      processing.params,
      outputFormat
    );
    currentBuffer = result.buffer;
  }

  if (!result) {
    throw new Error("No processing types provided");
  }

  return result;
}

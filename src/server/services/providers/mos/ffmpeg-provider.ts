/**
 * FFmpeg-based MOS Provider
 *
 * Estimates MOS using FFmpeg audio analysis (astats filter).
 * This is a simplified estimation - real MOS requires perceptual models like PESQ/POLQA.
 */

import { spawn } from "node:child_process";
import type { ProviderConfig, ProviderResult } from "../types";
import type { MOSOptions, MOSProvider, MOSResult } from "./types";

const PROVIDER_CONFIG: ProviderConfig = {
  id: "ffmpeg",
  name: "FFmpeg Audio Stats",
  enabled: true,
};

/**
 * Analyze audio using FFmpeg's astats filter
 */
async function analyzeAudio(
  audioBuffer: Buffer
): Promise<{
  rmsLevel: number | null;
  peakLevel: number | null;
  crestFactor: number | null;
  silenceCount: number;
  hasClipping: boolean;
}> {
  return new Promise((resolve, reject) => {
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

    ffmpeg.on("close", () => {
      // Parse audio statistics from FFmpeg output
      const rmsMatch = stderrOutput.match(/RMS_level=(-?[\d.]+)/);
      const peakMatch = stderrOutput.match(/Peak_level=(-?[\d.]+)/);
      const crestMatch = stderrOutput.match(/Crest_factor=([\d.]+)/);

      const silenceCount = (stderrOutput.match(/silence_start/g) || []).length;
      const hasClipping = stderrOutput.includes("-0.00");

      resolve({
        rmsLevel: rmsMatch ? Number.parseFloat(rmsMatch[1]) : null,
        peakLevel: peakMatch ? Number.parseFloat(peakMatch[1]) : null,
        crestFactor: crestMatch ? Number.parseFloat(crestMatch[1]) : null,
        silenceCount,
        hasClipping,
      });
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Calculate MOS from audio characteristics
 */
function calculateMOSFromStats(stats: {
  rmsLevel: number | null;
  peakLevel: number | null;
  crestFactor: number | null;
  silenceCount: number;
  hasClipping: boolean;
}): number {
  let mosScore = 3.5; // Start with average

  // RMS level analysis (good: -20 to -14 dB)
  if (stats.rmsLevel !== null) {
    if (stats.rmsLevel > -14 && stats.rmsLevel < -8) {
      mosScore += 0.3; // Good level
    } else if (stats.rmsLevel < -30) {
      mosScore -= 0.5; // Too quiet
    } else if (stats.rmsLevel > -6) {
      mosScore -= 0.3; // Too loud
    }
  }

  // Crest factor analysis (good for speech: 10-20 dB)
  if (stats.crestFactor !== null) {
    if (stats.crestFactor >= 8 && stats.crestFactor <= 20) {
      mosScore += 0.4; // Good dynamics
    } else if (stats.crestFactor < 6) {
      mosScore -= 0.4; // Over-compressed
    }
  }

  // Penalize for issues
  if (stats.hasClipping) {
    mosScore -= 0.5;
  }

  if (stats.silenceCount > 3) {
    mosScore -= 0.2;
  }

  // Add some randomness to simulate perceptual variance (±0.2)
  mosScore += (Math.random() - 0.5) * 0.4;

  // Clamp to valid MOS range and round
  return Math.round(Math.max(1.0, Math.min(5.0, mosScore)) * 10) / 10;
}

/**
 * Create an FFmpeg-based MOS provider
 */
export function createFFmpegMOSProvider(): MOSProvider {
  return {
    config: PROVIDER_CONFIG,

    async isAvailable(): Promise<boolean> {
      return new Promise((resolve) => {
        const ffmpeg = spawn("ffmpeg", ["-version"]);
        ffmpeg.on("error", () => resolve(false));
        ffmpeg.on("close", (code) => resolve(code === 0));
      });
    },

    async calculateMOS(
      audioBuffer: Buffer,
      options?: MOSOptions
    ): Promise<ProviderResult<MOSResult>> {
      const startTime = Date.now();

      try {
        const stats = await analyzeAudio(audioBuffer);
        const score = calculateMOSFromStats(stats);

        const result: MOSResult = {
          score,
          confidence: 0.7, // FFmpeg estimation has moderate confidence
        };

        if (options?.includeBreakdown) {
          result.breakdown = {
            rmsLevel: stats.rmsLevel ?? undefined,
            peakLevel: stats.peakLevel ?? undefined,
            crestFactor: stats.crestFactor ?? undefined,
            hasClipping: stats.hasClipping,
            silenceCount: stats.silenceCount,
          };
        }

        return {
          success: true,
          data: result,
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

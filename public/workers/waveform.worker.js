// @ts-nocheck
/**
 * Web Worker for calculating waveform peaks.
 *
 * Calculates all peaks upfront at a fixed rate (10 peaks/second).
 * Peaks are normalized to 0-1 range.
 *
 * Message types (in):
 * - { type: 'init', channelData: Float32Array, duration: number, sampleRate: number }
 *
 * Message types (out):
 * - { type: 'ready', peaks: Float32Array, totalPeaks: number }
 * - { type: 'error', message: string }
 */

const PEAKS_PER_SECOND = 50; // 1 peak per 0.1 seconds

self.onmessage = (e) => {
  const { type, channelData, duration, sampleRate } = e.data;

  if (type !== "init") {
    self.postMessage({ type: "error", message: "Unknown message type" });
    return;
  }

  try {
    const peaks = calculatePeaks(channelData, duration);
    self.postMessage(
      { type: "ready", peaks, totalPeaks: peaks.length },
      [peaks.buffer], // Transfer ownership for efficiency
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Calculate peaks at fixed intervals (10 peaks/second)
 */
function calculatePeaks(channelData, duration) {
  const totalPeaks = Math.ceil(duration * PEAKS_PER_SECOND);
  const samplesPerPeak = Math.floor(channelData.length / totalPeaks);
  const peaks = new Float32Array(totalPeaks);

  let maxPeak = 0;

  // Calculate peak values
  for (let i = 0; i < totalPeaks; i++) {
    const startSample = i * samplesPerPeak;
    const endSample = Math.min((i + 1) * samplesPerPeak, channelData.length);

    let max = 0;
    for (let j = startSample; j < endSample; j++) {
      const value = Math.abs(channelData[j]);
      if (value > max) max = value;
    }

    peaks[i] = max;
    if (max > maxPeak) maxPeak = max;
  }

  // Normalize to 0-1 range
  if (maxPeak > 0) {
    for (let i = 0; i < peaks.length; i++) {
      peaks[i] /= maxPeak;
    }
  }

  return peaks;
}

/**
 * Waveform data structure
 */
export interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
}

/**
 * Generates waveform peak data from an audio URL using Web Audio API
 * @param url - URL to the audio file
 * @param targetPeaks - Number of peaks to generate (default: 2000)
 * @returns Promise resolving to waveform data
 */
export async function generateWaveform(
  url: string,
  targetPeaks = 2000,
): Promise<WaveformData> {
  const audioContext = new AudioContext();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get channel data (use mono or average of stereo)
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.floor(channelData.length / targetPeaks);

    const peaks: number[] = [];

    for (let i = 0; i < targetPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const value = Math.abs(channelData[j] ?? 0);
        if (value > max) max = value;
      }

      peaks.push(max);
    }

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  } finally {
    await audioContext.close();
  }
}

/**
 * Normalizes peaks array to 0-1 range
 * @param peaks - Array of peak values
 * @returns Normalized peaks array
 */
export function normalizePeaks(peaks: number[]): number[] {
  const maxPeak = Math.max(...peaks);
  if (maxPeak === 0) return peaks.map(() => 0);
  return peaks.map((peak) => peak / maxPeak);
}

/**
 * Downsamples peaks to a target count for performance
 * @param peaks - Original peaks array
 * @param targetCount - Target number of peaks
 * @returns Downsampled peaks array
 */
export function downsamplePeaks(peaks: number[], targetCount: number): number[] {
  if (peaks.length <= targetCount) return peaks;

  const ratio = peaks.length / targetCount;
  const result: number[] = [];

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);

    let max = 0;
    for (let j = start; j < end; j++) {
      if ((peaks[j] ?? 0) > max) max = peaks[j] ?? 0;
    }
    result.push(max);
  }

  return result;
}

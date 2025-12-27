"use client";

import { useEffect, useState } from "react";
import WaveformData from "waveform-data";

interface WaveformDataState {
  waveform: WaveformData | null;
  isLoading: boolean;
  error: string | null;
}

interface UseWaveformDataOptions {
  datUrl: string;
}

/**
 * Hook to load waveform data from a .dat file using waveform-data.js.
 *
 * waveform-data.js handles:
 * - Binary .dat parsing (v1/v2 BBC audiowaveform format)
 * - Channel access via channel(index)
 * - Resampling via resample({ scale }) or resample({ width })
 * - Slicing via slice({ start_index, end_index })
 */
export function useWaveformData({
  datUrl,
}: UseWaveformDataOptions): WaveformDataState {
  const [state, setState] = useState<WaveformDataState>({
    waveform: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadWaveform() {
      try {
        const response = await fetch(datUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch .dat file: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // waveform-data.js handles the binary parsing automatically
        const waveform = WaveformData.create(arrayBuffer);

        if (!cancelled) {
          setState({
            waveform,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            waveform: null,
            isLoading: false,
            error:
              err instanceof Error ? err.message : "Failed to load waveform",
          });
        }
      }
    }

    loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [datUrl]);

  return state;
}

/**
 * Helper to create waveform from AudioBuffer using Web Audio API.
 * Replaces the web worker functionality.
 *
 * @param audioContext - Web Audio API context
 * @param arrayBuffer - Raw audio file data
 * @param scale - Samples per pixel (default: 512)
 */
export async function createWaveformFromAudio(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer,
  scale = 512,
): Promise<WaveformData> {
  return new Promise((resolve, reject) => {
    WaveformData.createFromAudio(
      {
        audio_context: audioContext,
        array_buffer: arrayBuffer,
        scale,
      },
      (err, waveform) => {
        if (err) {
          reject(err);
        } else if (waveform) {
          resolve(waveform);
        } else {
          reject(new Error("Failed to create waveform"));
        }
      },
    );
  });
}

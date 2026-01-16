"use client";

import { useEffect, useState } from "react";
import WaveformData from "waveform-data";
import { api } from "~/trpc/react";

type WaveformStatus = "pending" | "processing" | "completed" | "failed";

interface WaveformDataState {
  waveform: WaveformData | null;
  isLoading: boolean;
  status: WaveformStatus;
  error: string | null;
}

interface UseWaveformDataOptions {
  fileId: string;
}

/**
 * Hook to load waveform data from R2 storage.
 *
 * Polls for waveform generation status, then loads the .dat file when ready.
 * Uses waveform-data.js to parse BBC audiowaveform binary format.
 */
export function useWaveformData({
  fileId,
}: UseWaveformDataOptions): WaveformDataState {
  const [state, setState] = useState<WaveformDataState>({
    waveform: null,
    isLoading: true,
    status: "pending",
    error: null,
  });

  // Query waveform URL with polling for pending/processing states
  const { data, error: queryError } = api.file.getWaveformUrl.useQuery(
    { fileId },
    {
      // Poll every 2 seconds while pending or processing
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "pending" || status === "processing") {
          return 2000;
        }
        return false;
      },
      // Keep refetching in background for status updates
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: false,
    },
  );

  // Load waveform data when URL is available
  useEffect(() => {
    if (!data) return;

    // Update status
    if (data.status !== "completed") {
      setState((prev) => ({
        ...prev,
        status: data.status as WaveformStatus,
        isLoading: data.status === "pending" || data.status === "processing",
        error: data.error ?? null,
      }));
      return;
    }

    // URL is available, fetch the waveform data
    if (!data.url) return;

    let cancelled = false;
    const waveformUrl = data.url;

    async function loadWaveform() {
      try {
        const response = await fetch(waveformUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch waveform: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const waveform = WaveformData.create(arrayBuffer);

        if (!cancelled) {
          setState({
            waveform,
            isLoading: false,
            status: "completed",
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            waveform: null,
            isLoading: false,
            status: "failed",
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
  }, [data]);

  // Handle query errors
  useEffect(() => {
    if (queryError) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        status: "failed",
        error: queryError.message,
      }));
    }
  }, [queryError]);

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

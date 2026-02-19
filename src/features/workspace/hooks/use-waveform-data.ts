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
  sourceId: string;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    const char = binary.charCodeAt(i);
    bytes[i] = char;
  }

  return bytes.buffer;
}

/**
 * Hook to load waveform data inline from source.getById.
 *
 * Polls source ingest/waveform status, then decodes base64 waveform bytes
 * and parses them via waveform-data.js when completed.
 */
export function useWaveformData({
  sourceId,
}: UseWaveformDataOptions): WaveformDataState {
  const [state, setState] = useState<WaveformDataState>({
    waveform: null,
    isLoading: true,
    status: "pending",
    error: null,
  });

  const { data, error: queryError } = api.source.getById.useQuery(
    { id: sourceId },
    {
      refetchInterval: (query) => {
        const ingestStatus = query.state.data?.ingestStatus;
        const waveformStatus = query.state.data?.waveformStatus;

        if (
          ingestStatus === "pending" ||
          ingestStatus === "processing" ||
          waveformStatus === "pending" ||
          waveformStatus === "processing"
        ) {
          return 2000;
        }

        return false;
      },
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: false,
    },
  );

  useEffect(() => {
    if (!data) return;

    const status = data.waveformStatus ?? "pending";

    if (status === "pending" || status === "processing") {
      setState((prev) => ({
        ...prev,
        status,
        isLoading: true,
        error: data.waveformError ?? data.ingestError ?? null,
      }));
      return;
    }

    if (status === "failed") {
      setState({
        waveform: null,
        isLoading: false,
        status: "failed",
        error:
          data.waveformError ?? data.ingestError ?? "Waveform ingest failed",
      });
      return;
    }

    if (!data.waveformBase64) {
      setState({
        waveform: null,
        isLoading: false,
        status: "failed",
        error: "Waveform data is missing",
      });
      return;
    }

    try {
      const buffer = decodeBase64ToArrayBuffer(data.waveformBase64);
      const waveform = WaveformData.create(buffer);

      setState({
        waveform,
        isLoading: false,
        status: "completed",
        error: null,
      });
    } catch (error) {
      setState({
        waveform: null,
        isLoading: false,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse waveform data",
      });
    }
  }, [data]);

  useEffect(() => {
    if (!queryError) return;

    setState((prev) => ({
      ...prev,
      isLoading: false,
      status: "failed",
      error: queryError.message,
    }));
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

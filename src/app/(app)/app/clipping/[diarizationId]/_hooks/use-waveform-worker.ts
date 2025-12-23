"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WaveformWorkerState {
  isReady: boolean;
  peaks: Float32Array | null;
  totalPeaks: number;
  error: string | null;
}

interface WaveformWorkerResult extends WaveformWorkerState {
  initializeAudio: (
    channelData: Float32Array,
    duration: number,
    sampleRate: number,
  ) => void;
}

/**
 * Hook that manages a Web Worker for waveform peak calculation.
 *
 * Calculates all peaks upfront at a fixed rate (10 peaks/second).
 * Peaks only need to be calculated once - SVG scales naturally with zoom.
 */
export function useWaveformWorker(): WaveformWorkerResult {
  const workerRef = useRef<Worker | null>(null);

  const [state, setState] = useState<WaveformWorkerState>({
    isReady: false,
    peaks: null,
    totalPeaks: 0,
    error: null,
  });

  useEffect(() => {
    workerRef.current = new Worker("/workers/waveform.worker.js");

    workerRef.current.onmessage = (e) => {
      const { type, peaks, totalPeaks, message } = e.data;

      switch (type) {
        case "ready":
          setState({
            isReady: true,
            peaks,
            totalPeaks,
            error: null,
          });
          break;
        case "error":
          setState((prev) => ({
            ...prev,
            error: message,
          }));
          break;
      }
    };

    workerRef.current.onerror = (err) => {
      setState((prev) => ({
        ...prev,
        error: err.message || "Worker error",
      }));
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const initializeAudio = useCallback(
    (channelData: Float32Array, duration: number, sampleRate: number) => {
      if (!workerRef.current) return;

      setState({
        isReady: false,
        peaks: null,
        totalPeaks: 0,
        error: null,
      });

      // Clone the data since we transfer ownership to the worker
      const clonedData = new Float32Array(channelData);

      workerRef.current.postMessage(
        { type: "init", channelData: clonedData, duration, sampleRate },
        [clonedData.buffer],
      );
    },
    [],
  );

  return {
    ...state,
    initializeAudio,
  };
}

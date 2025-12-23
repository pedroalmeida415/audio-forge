"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WaveformWorkerResult {
  peaks: number[] | null;
  isCalculating: boolean;
  error: string | null;
  calculatePeaks: (channelData: Float32Array, targetPeaks: number) => void;
}

/**
 * Hook that manages a Web Worker for off-thread waveform peak calculation.
 */
export function useWaveformWorker(): WaveformWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Create worker
    workerRef.current = new Worker("/workers/waveform.worker.js");

    workerRef.current.onmessage = (e) => {
      const { type, peaks: resultPeaks, message } = e.data;

      if (type === "result") {
        setPeaks(resultPeaks);
        setIsCalculating(false);
        setError(null);
      } else if (type === "error") {
        setError(message);
        setIsCalculating(false);
      }
    };

    workerRef.current.onerror = (err) => {
      setError(err.message);
      setIsCalculating(false);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const calculatePeaks = useCallback(
    (channelData: Float32Array, targetPeaks: number) => {
      if (!workerRef.current) return;

      setIsCalculating(true);
      setError(null);

      // Clone the data since we can't transfer the original (might be needed elsewhere)
      const clonedData = new Float32Array(channelData);

      // Transfer the buffer to avoid copying
      workerRef.current.postMessage(
        { type: "calculate", channelData: clonedData, targetPeaks },
        [clonedData.buffer],
      );
    },
    [],
  );

  return { peaks, isCalculating, error, calculatePeaks };
}

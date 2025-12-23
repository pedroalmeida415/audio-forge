"use client";

import { Memo, useSelector } from "@legendapp/state/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useClippingStore } from "../../_context/store.context";
import { useWaveformWorker } from "../../_hooks/use-waveform-worker";

const WAVEFORM_HEIGHT = 80;

/**
 * Waveform visualization component using Legend-State's "render once" pattern.
 *
 * The path is generated once with a fixed coordinate system (1 unit per peak).
 * On zoom, only the SVG width changes - the browser scales the path automatically.
 */
export function TimelineWaveform() {
  const $store = useClippingStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedBufferRef = useRef<ArrayBuffer | null>(null);

  const {
    isReady: workerIsReady,
    peaks,
    totalPeaks,
    error: workerError,
    initializeAudio,
  } = useWaveformWorker();

  // Subscribe to duration so effect re-runs when audio loads
  const duration = useSelector(() => $store.playback.duration.get());

  // Initialize worker with audio data (only once when duration becomes available)
  useEffect(() => {
    const audioDataBuffer = $store.audioDataBuffer.peek() as ArrayBuffer | null;
    if (!audioDataBuffer || duration <= 0) return;
    if (loadedBufferRef.current === audioDataBuffer) return;

    loadedBufferRef.current = audioDataBuffer;
    setIsLoading(true);
    setError(null);

    const audioContext = new AudioContext();

    audioContext
      .decodeAudioData(audioDataBuffer.slice(0))
      .then((audioBuffer) => {
        const channelData = audioBuffer.getChannelData(0);
        initializeAudio(channelData, duration, audioBuffer.sampleRate);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load waveform",
        );
        setIsLoading(false);
      })
      .finally(() => {
        audioContext.close();
      });
  }, [$store, duration, initializeAudio]);

  // Generate path once with fixed coordinate system (1 unit per peak)
  // The SVG viewBox is fixed; only the width changes on zoom
  const waveformPath = useMemo(() => {
    if (!peaks || peaks.length === 0 || totalPeaks === 0) return null;
    return generateWaveformPath(peaks, WAVEFORM_HEIGHT);
  }, [peaks, totalPeaks]);

  const displayError = error || workerError;

  if (isLoading || (!workerIsReady && !displayError)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <span className="text-muted-foreground text-sm">{displayError}</span>
      </div>
    );
  }

  if (!waveformPath || totalPeaks === 0) return null;

  // Fixed viewBox based on peak count - SVG scales automatically
  const viewBoxWidth = totalPeaks;

  return (
    <div className="relative flex-1 overflow-hidden">
      <Memo>
        {() => {
          const totalWidth = $store.timeline.getTotalWidth.get();
          if (totalWidth <= 0) return null;

          return (
            <svg
              aria-hidden="true"
              className="h-full"
              height={WAVEFORM_HEIGHT}
              preserveAspectRatio="none"
              style={{ width: totalWidth }}
              viewBox={`0 0 ${viewBoxWidth} ${WAVEFORM_HEIGHT}`}
            >
              <path className="fill-primary/70" d={waveformPath} />
            </svg>
          );
        }}
      </Memo>
    </div>
  );
}

/**
 * Generates an SVG path with fixed coordinates (1 unit per bar).
 * The path is generated once; SVG scaling handles zoom.
 */
function generateWaveformPath(peaks: Float32Array, height: number): string {
  // Fixed bar width of 1 unit, with 0.2 unit gap
  const barWidth = 1;
  const barGap = 0.2;
  const effectiveBarWidth = barWidth - barGap;
  const cornerRadius = Math.min(0.15, effectiveBarWidth / 2);

  const pathCommands: string[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i] ?? 0;
    const barHeight = Math.max(2, peak * (height - 4));
    const x = i * barWidth;
    const y = (height - barHeight) / 2;

    const r = Math.min(cornerRadius, effectiveBarWidth / 2, barHeight / 2);

    pathCommands.push(
      `M${x + r},${y}`,
      `h${effectiveBarWidth - 2 * r}`,
      `a${r},${r} 0 0 1 ${r},${r}`,
      `v${barHeight - 2 * r}`,
      `a${r},${r} 0 0 1 -${r},${r}`,
      `h-${effectiveBarWidth - 2 * r}`,
      `a${r},${r} 0 0 1 -${r},-${r}`,
      `v-${barHeight - 2 * r}`,
      `a${r},${r} 0 0 1 ${r},-${r}`,
      "Z",
    );
  }

  return pathCommands.join(" ");
}

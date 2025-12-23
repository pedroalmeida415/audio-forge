"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useClippingStore } from "../../_context/store.context";
import { useWaveformWorker } from "../../_hooks/use-waveform-worker";
import { calculatePixelsPerSecond } from "../../_utils/zoom-utils";

/**
 * Waveform visualization component.
 *
 * Loads all peaks upfront at 10 peaks/second and renders them as an SVG.
 * The SVG scales naturally with zoom - no recalculation needed.
 */
export function TimelineWaveform() {
  const $store = useClippingStore();
  const duration = useValue($store.playback.duration);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedBufferRef = useRef<ArrayBuffer | null>(null);
  const playedWrapperRef = useRef<HTMLDivElement>(null);

  const {
    isReady: workerIsReady,
    peaks,
    totalPeaks,
    error: workerError,
    initializeAudio,
  } = useWaveformWorker();

  // Calculate total width based on zoom
  const pixelsPerSecond = calculatePixelsPerSecond(
    zoomLevel,
    duration,
    containerWidth,
  );
  const totalWidth = Math.max(1, duration * pixelsPerSecond);

  // Subscribe to time updates for playhead progress (direct DOM manipulation)
  useEffect(() => {
    if (!duration || duration <= 0) return;

    const initialTime = $store.playback.currentTime.peek();
    if (playedWrapperRef.current) {
      const percentage = (initialTime / duration) * 100;
      playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    }

    const dispose = observe(() => {
      const time = $store.playback.currentTime.get();
      if (playedWrapperRef.current) {
        const percentage = (time / duration) * 100;
        playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
      }
    });

    return dispose;
  }, [$store, duration]);

  // Initialize worker with audio data (only once)
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

  // Generate SVG path from peaks
  const waveformPath = (() => {
    if (!peaks || peaks.length === 0 || totalPeaks === 0) return "";

    const height = 80;
    const barWidth = totalWidth / totalPeaks;
    const barGap = Math.min(1, barWidth * 0.2); // Gap scales with bar width
    const effectiveBarWidth = Math.max(0.5, barWidth - barGap);
    const cornerRadius = Math.min(1, effectiveBarWidth / 2);

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
  })();

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

  if (!peaks || !waveformPath) return null;

  const height = 80;

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Unplayed waveform (dark/muted) */}
      <svg
        aria-hidden="true"
        className="h-full"
        height={height}
        preserveAspectRatio="none"
        style={{ width: totalWidth }}
        viewBox={`0 0 ${totalWidth} ${height}`}
      >
        <path className="fill-muted-foreground/30" d={waveformPath} />
      </svg>

      {/* Played waveform (bright) - clipped via CSS */}
      <div
        ref={playedWrapperRef}
        className="absolute inset-0 will-change-[clip-path]"
        style={{ clipPath: "inset(0 100% 0 0)" }}
      >
        <svg
          aria-hidden="true"
          className="h-full"
          height={height}
          preserveAspectRatio="none"
          style={{ width: totalWidth }}
          viewBox={`0 0 ${totalWidth} ${height}`}
        >
          <path className="fill-primary/70" d={waveformPath} />
        </svg>
      </div>
    </div>
  );
}

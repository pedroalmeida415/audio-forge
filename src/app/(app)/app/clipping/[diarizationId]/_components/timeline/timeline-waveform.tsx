"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-workspace-store";
import {
  downsamplePeaks,
  generateWaveform,
  normalizePeaks,
  type WaveformData,
} from "../../_utils/waveform-utils";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

export function TimelineWaveform() {
  const store = useClippingStore();
  const { audioDataBufferRef } = usePlayback();
  const duration = useClippingStore((s) => s.playback.duration);
  const zoomLevel = useClippingStore((s) => s.timeline.zoomLevel);
  const containerWidth = useClippingStore((s) => s.timeline.containerWidth);

  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedBufferRef = useRef<ArrayBuffer | null>(null);
  const playedWrapperRef = useRef<HTMLDivElement>(null);

  // Calculate derived values
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

  // Calculate total width based on duration and zoom
  const totalWidth = Math.max(1, duration * pixelsPerSecond);

  // Subscribe to time updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    if (!duration || duration <= 0) return;

    // Set initial position
    const initialTime = store.getState().playback.currentTime;
    if (playedWrapperRef.current) {
      const percentage = (initialTime / duration) * 100;
      playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    }

    const unsubscribe = store.subscribe(
      (state) => state.playback.currentTime,
      (time) => {
        if (playedWrapperRef.current) {
          const percentage = (time / duration) * 100;
          playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
        }
      },
    );

    return unsubscribe;
  }, [store, duration]);

  // Load waveform data only once when audio URL is first available
  // biome-ignore lint/correctness/useExhaustiveDependencies: Ref should not change
  useEffect(() => {
    if (!audioDataBufferRef.current || duration <= 0) return;
    // Prevent reloading if we already loaded this URL
    if (loadedBufferRef.current === audioDataBufferRef.current) return;

    loadedBufferRef.current = audioDataBufferRef.current;
    setIsLoading(true);
    setError(null);

    generateWaveform(audioDataBufferRef.current, 2000)
      .then((data) => {
        setWaveformData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load waveform",
        );
        setIsLoading(false);
      });
  }, [duration]);

  // Prepare peaks for display based on current zoom level
  const displayPeaks = (() => {
    if (!waveformData) return null;

    // Calculate how many peaks we want based on current width (2px per bar minimum)
    const targetPeaks = Math.max(100, Math.floor(totalWidth / 2));
    const downsampled = downsamplePeaks(waveformData.peaks, targetPeaks);
    return normalizePeaks(downsampled);
  })();

  // Generate SVG path from peaks
  const waveformPath = (() => {
    if (!displayPeaks || displayPeaks.length === 0) return "";

    const height = 80;
    const barWidth = totalWidth / displayPeaks.length;
    const barGap = 1;
    const effectiveBarWidth = Math.max(1, barWidth - barGap);
    const cornerRadius = 1;

    // Build path commands for all bars
    const pathCommands: string[] = [];

    for (let i = 0; i < displayPeaks.length; i++) {
      const peak = displayPeaks[i] ?? 0;
      const barHeight = Math.max(2, peak * (height - 4));
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      // Draw rounded rectangle using path commands
      // M = move to, h = horizontal line, v = vertical line, a = arc
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

  if (isLoading || (!displayPeaks && !error)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <span className="text-muted-foreground text-sm">{error}</span>
      </div>
    );
  }

  if (!displayPeaks || !waveformPath) return null;

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

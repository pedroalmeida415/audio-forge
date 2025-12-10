"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import {
  downsamplePeaks,
  generateWaveform,
  normalizePeaks,
  type WaveformData,
} from "~/lib/waveform-utils";
import { useClippingWorkspace } from "../../_context/clipping-workspace-context";

export function TimelineWaveform() {
  const { audioDataBuffer, audioPlayer, timeline } = useClippingWorkspace();
  const { currentTime, duration } = audioPlayer;
  const { pixelsPerSecond } = timeline;
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedBufferRef = useRef<ArrayBuffer | null>(null);
  const clipPathRef = useRef<SVGRectElement>(null);

  // Calculate total width based on duration and zoom
  const totalWidth = useMemo(() => {
    return Math.max(1, duration * pixelsPerSecond);
  }, [duration, pixelsPerSecond]);

  // Update played clip position using direct DOM manipulation for smooth animation
  useEffect(() => {
    if (clipPathRef.current && duration > 0) {
      const playedWidth = (currentTime / duration) * totalWidth;
      clipPathRef.current.setAttribute("width", String(playedWidth));
    }
  }, [currentTime, duration, totalWidth]);

  // Load waveform data only once when audio URL is first available
  useEffect(() => {
    if (!audioDataBuffer || duration <= 0) return;
    // Prevent reloading if we already loaded this URL
    if (loadedBufferRef.current === audioDataBuffer) return;

    loadedBufferRef.current = audioDataBuffer;
    setIsLoading(true);
    setError(null);

    generateWaveform(audioDataBuffer, 2000)
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
  }, [audioDataBuffer, duration]);

  // Prepare peaks for display based on current zoom level
  const displayPeaks = useMemo(() => {
    if (!waveformData) return null;

    // Calculate how many peaks we want based on current width (2px per bar minimum)
    const targetPeaks = Math.max(100, Math.floor(totalWidth / 2));
    const downsampled = downsamplePeaks(waveformData.peaks, targetPeaks);
    return normalizePeaks(downsampled);
  }, [waveformData, totalWidth]);

  // Generate SVG path from peaks
  const waveformPath = useMemo(() => {
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
  }, [displayPeaks, totalWidth]);

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
  const playedWidth = duration > 0 ? (currentTime / duration) * totalWidth : 0;

  return (
    <div className="flex-1 overflow-hidden">
      <svg
        className="h-full"
        height={height}
        preserveAspectRatio="none"
        style={{ width: totalWidth }}
        viewBox={`0 0 ${totalWidth} ${height}`}
      >
        <defs>
          <clipPath id="played-clip">
            <rect
              height={height}
              ref={clipPathRef}
              width={playedWidth}
              x={0}
              y={0}
            />
          </clipPath>
        </defs>

        {/* Unplayed waveform (dark/muted) */}
        <path className="fill-muted-foreground/30" d={waveformPath} />

        {/* Played waveform (bright) - clipped to current time */}
        <path
          className="fill-primary/70"
          clipPath="url(#played-clip)"
          d={waveformPath}
        />
      </svg>
    </div>
  );
}

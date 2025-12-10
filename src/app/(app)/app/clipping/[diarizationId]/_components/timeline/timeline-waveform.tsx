"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import {
  downsamplePeaks,
  generateWaveform,
  normalizePeaks,
  type WaveformData,
} from "~/lib/waveform-utils";

interface TimelineWaveformProps {
  audioUrl: string | null;
  duration: number;
  pixelsPerSecond: number;
}

export function TimelineWaveform({
  audioUrl,
  duration,
  pixelsPerSecond,
}: TimelineWaveformProps) {
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  // Calculate total width based on duration and zoom
  const totalWidth = useMemo(() => {
    return Math.max(1, duration * pixelsPerSecond);
  }, [duration, pixelsPerSecond]);

  // Load waveform data only once when audio URL is first available
  useEffect(() => {
    if (!audioUrl || duration <= 0) return;
    // Prevent reloading if we already loaded this URL
    if (loadedUrlRef.current === audioUrl) return;

    loadedUrlRef.current = audioUrl;
    setIsLoading(true);
    setError(null);

    generateWaveform(audioUrl, 2000)
      .then((data) => {
        setWaveformData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load waveform");
        setIsLoading(false);
      });
  }, [audioUrl, duration]);

  // Prepare peaks for display based on current zoom level
  const displayPeaks = useMemo(() => {
    if (!waveformData) return null;

    // Calculate how many peaks we want based on current width (2px per bar minimum)
    const targetPeaks = Math.max(100, Math.floor(totalWidth / 2));
    const downsampled = downsamplePeaks(waveformData.peaks, targetPeaks);
    return normalizePeaks(downsampled);
  }, [waveformData, totalWidth]);

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

  if (!displayPeaks) return null;

  const barWidth = totalWidth / displayPeaks.length;
  const height = 80;

  return (
    <div className="flex-1 overflow-hidden">
      <svg
        className="h-full"
        height={height}
        preserveAspectRatio="none"
        style={{ width: totalWidth }}
        viewBox={`0 0 ${totalWidth} ${height}`}
      >
        {displayPeaks.map((peak, i) => {
          const barHeight = Math.max(2, peak * (height - 4));
          const y = (height - barHeight) / 2;

          return (
            <rect
              className="fill-muted-foreground/40"
              height={barHeight}
              key={i}
              rx={1}
              width={Math.max(1, barWidth - 1)}
              x={i * barWidth}
              y={y}
            />
          );
        })}
      </svg>
    </div>
  );
}

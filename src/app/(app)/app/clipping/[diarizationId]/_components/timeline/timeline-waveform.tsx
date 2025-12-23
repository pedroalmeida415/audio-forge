"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { useClippingStore } from "../../_context/store.context";
import { useWaveformWorker } from "../../_hooks/use-waveform-worker";
import { TIMELINE_CONSTANTS } from "../../_store/constants";
import { downsamplePeaks, normalizePeaks } from "../../_utils/waveform-utils";
import { calculatePixelsPerSecond } from "../../_utils/zoom-utils";

const { COARSE_PEAKS, DETAILED_PEAKS, WAVEFORM_DEBOUNCE_MS } =
  TIMELINE_CONSTANTS;

/**
 * Generates peaks from raw channel data (runs on main thread for coarse initial render).
 */
function generatePeaksFromChannelData(
  channelData: Float32Array,
  targetPeaks: number,
): number[] {
  const samplesPerPeak = Math.floor(channelData.length / targetPeaks);
  const peaks: number[] = [];

  for (let i = 0; i < targetPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);

    let max = 0;
    for (let j = start; j < end; j++) {
      const value = Math.abs(channelData[j] ?? 0);
      if (value > max) max = value;
    }

    peaks.push(max);
  }

  return peaks;
}

export function TimelineWaveform() {
  const $store = useClippingStore();
  const duration = useValue($store.playback.duration);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);
  const isZooming = useValue($store.timeline.isZooming);

  // Waveform data state
  const [coarsePeaks, setCoarsePeaks] = useState<number[] | null>(null);
  const [detailedPeaks, setDetailedPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedBufferRef = useRef<ArrayBuffer | null>(null);
  const playedWrapperRef = useRef<HTMLDivElement>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Worker for detailed peak calculation
  const {
    peaks: workerPeaks,
    isCalculating: workerIsCalculating,
    calculatePeaks,
  } = useWaveformWorker();

  // Calculate derived values
  const pixelsPerSecond = calculatePixelsPerSecond(
    zoomLevel,
    duration,
    containerWidth,
  );

  // Calculate total width based on duration and zoom
  const totalWidth = Math.max(1, duration * pixelsPerSecond);

  // Update store with worker calculation state
  useEffect(() => {
    $store.timeline.setIsCalculatingPeaks(workerIsCalculating);
  }, [workerIsCalculating, $store]);

  // Update detailed peaks when worker finishes
  useEffect(() => {
    if (workerPeaks) {
      setDetailedPeaks(workerPeaks);
    }
  }, [workerPeaks]);

  // Subscribe to time updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    if (!duration || duration <= 0) return;

    // Set initial position
    const initialTime = $store.playback.currentTime.peek();
    if (playedWrapperRef.current) {
      const percentage = (initialTime / duration) * 100;
      playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    }

    // observe() replaces store.subscribe()
    const dispose = observe(() => {
      const time = $store.playback.currentTime.get();
      if (playedWrapperRef.current) {
        const percentage = (time / duration) * 100;
        playedWrapperRef.current.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
      }
    });

    return dispose;
  }, [$store, duration]);

  // Load initial coarse waveform data
  useEffect(() => {
    const audioDataBuffer = $store.audioDataBuffer.peek() as ArrayBuffer | null;
    if (!audioDataBuffer || duration <= 0) return;
    // Prevent reloading if we already loaded this buffer
    if (loadedBufferRef.current === audioDataBuffer) return;

    loadedBufferRef.current = audioDataBuffer;
    setIsLoading(true);
    setError(null);

    const audioContext = new AudioContext();

    audioContext
      .decodeAudioData(audioDataBuffer.slice(0))
      .then((audioBuffer) => {
        audioBufferRef.current = audioBuffer;

        // Generate coarse peaks for fast initial render
        const channelData = audioBuffer.getChannelData(0);
        const peaks = generatePeaksFromChannelData(channelData, COARSE_PEAKS);
        setCoarsePeaks(normalizePeaks(peaks));
        setIsLoading(false);

        // Also trigger detailed calculation immediately for initial load
        calculatePeaks(channelData, DETAILED_PEAKS);
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
  }, [$store, duration, calculatePeaks]);

  // Trigger detailed peak calculation when zoom stops
  useEffect(() => {
    if (isZooming || !audioBufferRef.current) return;

    // Clear any pending debounce
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current);
    }

    zoomDebounceRef.current = setTimeout(() => {
      const audioBuffer = audioBufferRef.current;
      if (!audioBuffer) return;

      // Calculate detailed peaks via worker
      const channelData = audioBuffer.getChannelData(0);
      calculatePeaks(channelData, DETAILED_PEAKS);
    }, WAVEFORM_DEBOUNCE_MS);

    return () => {
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
      }
    };
  }, [isZooming, calculatePeaks]);

  // Choose which peaks to display
  // Always prefer detailed peaks once available - only use coarse for initial load
  // This prevents jarring switches during zoom; the waveform will stretch/compress
  // smoothly until new detailed peaks arrive from the worker
  const displayPeaks = (() => {
    const sourcePeaks = detailedPeaks ?? coarsePeaks;
    if (!sourcePeaks) return null;

    // Calculate how many peaks we want based on current width (2px per bar minimum)
    const targetPeaks = Math.max(100, Math.floor(totalWidth / 2));
    const downsampled = downsamplePeaks(sourcePeaks, targetPeaks);
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

  // Show shimmer when worker is calculating or zooming rapidly
  const showShimmer = isZooming || workerIsCalculating;

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
      {/* Shimmer overlay when calculating */}
      {showShimmer && (
        <div
          className="pointer-events-none absolute inset-0 z-10 animate-shimmer"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(245, 166, 35, 0.08), transparent)",
            backgroundSize: "200% 100%",
          }}
        />
      )}

      {/* Unplayed waveform (dark/muted) */}
      <svg
        aria-hidden="true"
        className={cn(
          "h-full transition-opacity duration-200",
          showShimmer && "opacity-80",
        )}
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
          className={cn(
            "h-full transition-opacity duration-200",
            showShimmer && "opacity-80",
          )}
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

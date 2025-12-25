"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useClippingStore } from "../../_context/store.context";
import {
  CHUNK_DURATION,
  getChunkCount,
  getVisibleChunkIndices,
} from "../../_utils/chunk-utils";
import {
  calculateDurationFromDat,
  parseWaveformDat,
  type WaveformDatHeader,
} from "../../_utils/parse-waveform-dat";

const WAVEFORM_HEIGHT = 80;
const OVERSCAN = 1;
const SVG_NS = "http://www.w3.org/2000/svg";

// LOD settings: adjust detail based on zoom level
const MIN_BAR_WIDTH_PX = 2; // Minimum pixels per bar (determines max bars per chunk)

interface WaveformChunkData {
  index: number;
  peaks: Float32Array;
  nativeWidth: number;
  duration: number;
}

/**
 * Waveform visualization with true virtualization + path clipping.
 *
 * - DOM elements created/removed directly (no React state for virtualization)
 * - Path data clipped to viewport bounds (minimal geometry)
 * - Everything managed via observe() for maximum performance
 */
export function TimelineWaveform() {
  const $store = useClippingStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathElementsMap = useRef<Map<number, SVGPathElement>>(new Map());
  const chunksDataRef = useRef<WaveformChunkData[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Subscribe to container width for SVG sizing
  const containerWidth = useSelector(() =>
    $store.timeline.containerWidth.get(),
  );

  // Load waveform data once
  useEffect(() => {
    fetch("/audiowaveform.dat")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch .dat: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        const { header, peaks } = parseWaveformDat(buffer);
        const duration = calculateDurationFromDat(header);

        // Store chunk data in ref (no React state)
        chunksDataRef.current = createChunksData(peaks, header, duration);
        setIsLoading(false);
        setIsReady(true);
      })
      .catch((err) => {
        console.error("[Waveform] Error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load waveform",
        );
        setIsLoading(false);
      });
  }, []);

  // Manage DOM elements and path data directly
  useEffect(() => {
    if (!isReady || !svgRef.current) return;

    const svg = svgRef.current;
    const chunksData = chunksDataRef.current;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerW = $store.timeline.containerWidth.get();
      const duration = $store.playback.duration.get();

      // Calculate which chunks should be visible
      const { startIndex, endIndex } = getVisibleChunkIndices(
        scrollOffset,
        containerW,
        pps,
        duration,
        OVERSCAN,
      );

      // Build set of visible indices for fast lookup
      const visibleIndices = new Set<number>();
      for (let i = startIndex; i <= endIndex; i++) {
        visibleIndices.add(i);
      }

      // Remove paths that are no longer visible
      pathElementsMap.current.forEach((pathEl, chunkIndex) => {
        if (!visibleIndices.has(chunkIndex)) {
          pathEl.remove();
          pathElementsMap.current.delete(chunkIndex);
        }
      });

      // Add/update paths for visible chunks
      visibleIndices.forEach((chunkIndex) => {
        const chunk = chunksData[chunkIndex];
        if (!chunk) return;

        // Create path element if it doesn't exist
        let pathEl = pathElementsMap.current.get(chunkIndex);
        if (!pathEl) {
          pathEl = document.createElementNS(SVG_NS, "path");
          pathEl.classList.add("fill-primary/70");
          svg.appendChild(pathEl);
          pathElementsMap.current.set(chunkIndex, pathEl);
        }

        // Calculate chunk pixel width for LOD
        const chunkPixelWidth = chunk.duration * pps;

        // Dynamic downsampling: target 1 bar per MIN_BAR_WIDTH_PX pixels
        const targetBars = Math.max(
          1,
          Math.floor(chunkPixelWidth / MIN_BAR_WIDTH_PX),
        );
        const lodPeaks =
          targetBars < chunk.peaks.length
            ? downsamplePeaks(chunk.peaks, targetBars)
            : chunk.peaks;

        // Calculate chunk position
        const chunkStartPx = chunkIndex * CHUNK_DURATION * pps;
        const offsetX = chunkStartPx - scrollOffset;

        // Generate path with viewport clipping and LOD
        const pathD = generateClippedPath(
          lodPeaks,
          WAVEFORM_HEIGHT,
          offsetX,
          chunkPixelWidth,
          containerW,
        );
        pathEl.setAttribute("d", pathD);
      });
    });

    return () => {
      dispose();
      // Clean up all path elements
      for (const pathEl of pathElementsMap.current.values()) {
        pathEl.remove();
      }
      pathElementsMap.current.clear();
    };
  }, [isReady, $store]);

  if (isLoading) {
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

  return (
    <div className="relative flex-1 overflow-hidden">
      <svg
        ref={svgRef}
        aria-hidden="true"
        className="h-full w-full"
        height={WAVEFORM_HEIGHT}
        width={containerWidth}
        viewBox={`0 0 ${containerWidth} ${WAVEFORM_HEIGHT}`}
        preserveAspectRatio="none"
      />
    </div>
  );
}

// Store raw peaks without pre-downsampling - LOD handles this dynamically
const MAX_STORED_PEAKS_PER_CHUNK = 1000;

/**
 * Create chunk data from parsed peaks.
 * Stores peaks for later LOD-based downsampling.
 */
function createChunksData(
  peaks: Float32Array,
  header: WaveformDatHeader,
  duration: number,
): WaveformChunkData[] {
  const peaksPerSecond = header.sampleRate / header.samplesPerPixel;
  const peaksPerChunk = Math.ceil(CHUNK_DURATION * peaksPerSecond);
  const chunkCount = getChunkCount(duration);

  const chunks: WaveformChunkData[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const startPeak = i * peaksPerChunk;
    const endPeak = Math.min(startPeak + peaksPerChunk, peaks.length);
    const chunkPeaks = peaks.slice(startPeak, endPeak);

    const chunkStartTime = i * CHUNK_DURATION;
    const chunkEndTime = Math.min((i + 1) * CHUNK_DURATION, duration);
    const chunkDuration = chunkEndTime - chunkStartTime;

    // Pre-downsample to reasonable max for memory, LOD will further reduce
    const storedPeaks =
      chunkPeaks.length > MAX_STORED_PEAKS_PER_CHUNK
        ? downsamplePeaks(chunkPeaks, MAX_STORED_PEAKS_PER_CHUNK)
        : chunkPeaks;

    chunks.push({
      index: i,
      peaks: storedPeaks,
      nativeWidth: storedPeaks.length, // Just count, not scaled
      duration: chunkDuration,
    });
  }

  return chunks;
}

/**
 * Generate SVG path with viewport clipping and LOD-aware rendering.
 * Only includes bars visible in viewport, with simplified rendering for tiny bars.
 */
function generateClippedPath(
  peaks: Float32Array,
  height: number,
  offsetX: number,
  chunkWidth: number,
  viewportWidth: number,
): string {
  if (peaks.length === 0) return "";

  // Calculate bar width based on peaks count and chunk width
  const barWidth = chunkWidth / peaks.length;
  const barGap = barWidth * 0.2;
  const effectiveBarWidth = Math.max(0.5, barWidth - barGap);

  // Use simple rectangles for tiny bars (< 3px), rounded for larger
  const useRounded = effectiveBarWidth >= 3;

  const pathCommands: string[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const x = offsetX + i * barWidth;

    // Skip bars completely outside viewport (clipping)
    if (x + barWidth < 0) continue;
    if (x > viewportWidth) break; // Can break since bars are sequential

    const peak = peaks[i] ?? 0;
    const barHeight = Math.max(2, peak * (height - 4));
    const y = (height - barHeight) / 2;

    if (useRounded) {
      // Full rounded rectangle path
      const r = Math.min(
        effectiveBarWidth * 0.15,
        effectiveBarWidth / 2,
        barHeight / 2,
      );
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
    } else {
      // Simple rectangle (much faster for tiny bars)
      pathCommands.push(
        `M${x},${y}`,
        `h${effectiveBarWidth}`,
        `v${barHeight}`,
        `h-${effectiveBarWidth}`,
        "Z",
      );
    }
  }

  return pathCommands.join(" ");
}

/**
 * Downsample peaks by taking the max value in each bucket.
 */
function downsamplePeaks(peaks: Float32Array, maxPeaks: number): Float32Array {
  if (peaks.length <= maxPeaks) return peaks;

  const ratio = peaks.length / maxPeaks;
  const result = new Float32Array(maxPeaks);

  for (let i = 0; i < maxPeaks; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);

    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      const val = peaks[j] ?? 0;
      if (val > max) max = val;
    }
    result[i] = max;
  }

  return result;
}

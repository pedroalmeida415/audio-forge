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
const MAX_PEAKS_PER_CHUNK = 500;
const OVERSCAN = 2;

interface WaveformChunkData {
  index: number;
  peaks: Float32Array; // Raw peaks for regenerating path
  nativeWidth: number; // Width in native coordinates
  duration: number; // Chunk duration in seconds
}

/**
 * Waveform visualization with direct DOM manipulation.
 *
 * Pre-renders paths once, then updates d attributes directly
 * when scroll/zoom changes. No React re-renders during interaction.
 */
export function TimelineWaveform() {
  const $store = useClippingStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefsMap = useRef<Map<number, SVGPathElement>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chunksData, setChunksData] = useState<WaveformChunkData[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);

  // Subscribe to container width for SVG sizing
  const containerWidth = useSelector(() => $store.timeline.containerWidth.get());

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
        setAudioDuration(duration);

        // Create chunk data with raw peaks
        const chunks = createChunksData(peaks, header, duration);
        setChunksData(chunks);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("[Waveform] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to load waveform");
        setIsLoading(false);
      });
  }, []);

  // Direct DOM manipulation for scroll/zoom
  useEffect(() => {
    if (chunksData.length === 0) return;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerW = $store.timeline.containerWidth.get();
      const duration = $store.playback.duration.get();

      // Calculate visible chunks
      const { startIndex, endIndex } = getVisibleChunkIndices(
        scrollOffset,
        containerW,
        pps,
        duration,
        OVERSCAN,
      );

      // Update each path's visibility and d attribute directly
      pathRefsMap.current.forEach((pathEl, chunkIndex) => {
        const chunk = chunksData[chunkIndex];
        if (!chunk) return;

        const isVisible = chunkIndex >= startIndex && chunkIndex <= endIndex;

        if (!isVisible) {
          // Hide non-visible paths completely (avoids processing empty d)
          pathEl.style.display = "none";
          return;
        }

        // Show and update visible paths
        pathEl.style.display = "";

        // Calculate chunk position relative to viewport
        const chunkStartPx = chunkIndex * CHUNK_DURATION * pps;
        const offsetX = chunkStartPx - scrollOffset;

        // Calculate scale factor
        const desiredWidth = chunk.duration * pps;
        const scaleX = chunk.nativeWidth > 0 ? desiredWidth / chunk.nativeWidth : 1;

        // Generate path with offset and scale baked in
        const pathD = generatePathWithTransform(
          chunk.peaks,
          WAVEFORM_HEIGHT,
          offsetX,
          scaleX,
        );
        pathEl.setAttribute("d", pathD);
      });
    });

    return dispose;
  }, [chunksData, $store]);

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

  if (chunksData.length === 0) return null;

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
      >
        {chunksData.map((chunk) => (
          <path
            key={chunk.index}
            ref={(el) => {
              if (el) {
                pathRefsMap.current.set(chunk.index, el);
              } else {
                pathRefsMap.current.delete(chunk.index);
              }
            }}
            className="fill-primary/70"
          />
        ))}
      </svg>
    </div>
  );
}

const BAR_WIDTH = 1; // Fixed bar width in native coordinates

/**
 * Create chunk data from parsed peaks.
 * Stores raw peaks for path regeneration on scroll/zoom.
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

    // Calculate chunk duration (last chunk may be shorter)
    const chunkStartTime = i * CHUNK_DURATION;
    const chunkEndTime = Math.min((i + 1) * CHUNK_DURATION, duration);
    const chunkDuration = chunkEndTime - chunkStartTime;

    // Downsample if too many peaks
    const downsampledPeaks =
      chunkPeaks.length > MAX_PEAKS_PER_CHUNK
        ? downsamplePeaks(chunkPeaks, MAX_PEAKS_PER_CHUNK)
        : chunkPeaks;

    chunks.push({
      index: i,
      peaks: downsampledPeaks,
      nativeWidth: downsampledPeaks.length * BAR_WIDTH,
      duration: chunkDuration,
    });
  }

  return chunks;
}

/**
 * Generate SVG path with transform baked in.
 * Applies offsetX and scaleX directly to coordinates.
 */
function generatePathWithTransform(
  peaks: Float32Array,
  height: number,
  offsetX: number,
  scaleX: number,
): string {
  if (peaks.length === 0) return "";

  const scaledBarWidth = BAR_WIDTH * scaleX;
  const barGap = scaledBarWidth * 0.2;
  const effectiveBarWidth = scaledBarWidth - barGap;
  const cornerRadius = Math.min(scaledBarWidth * 0.15, effectiveBarWidth / 2);

  const pathCommands: string[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i] ?? 0;
    const barHeight = Math.max(2, peak * (height - 4));
    const x = offsetX + i * scaledBarWidth;
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

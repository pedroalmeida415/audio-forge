"use client";

import { useSelector } from "@legendapp/state/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useClippingStore } from "../../_context/store.context";
import { CHUNK_DURATION, getChunkCount } from "../../_utils/chunk-utils";
import {
  calculateDurationFromDat,
  parseWaveformDat,
  type WaveformDatHeader,
} from "../../_utils/parse-waveform-dat";

const WAVEFORM_HEIGHT = 80;
const MAX_PEAKS_PER_CHUNK = 500; // Limit peaks per chunk for reasonable path size

interface WaveformChunk {
  index: number;
  pathD: string;
  nativeWidth: number; // Width of path in local coordinates (peaks * barWidth)
  duration: number; // Duration this chunk represents in seconds
}

/**
 * Virtualized waveform visualization.
 *
 * Splits the waveform into 10-second chunks, each with its own SVG path.
 * Only visible chunks are rendered using TanStack Virtual.
 */
export function TimelineWaveform() {
  const $store = useClippingStore();
  const { scrollContainerRef } = $store.playback.peek().refs;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<WaveformChunk[]>([]);
  const [duration, setDuration] = useState(0);

  // Load and chunk the waveform data
  useEffect(() => {
    fetch("/audiowaveform.dat")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch .dat: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        const { header, peaks } = parseWaveformDat(buffer);
        const audioDuration = calculateDurationFromDat(header);
        setDuration(audioDuration);

        // Process peaks into chunks
        const waveformChunks = createWaveformChunks(peaks, header, audioDuration);
        setChunks(waveformChunks);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("[Waveform] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to load waveform");
        setIsLoading(false);
      });
  }, []);

  // Subscribe to reactive values for virtualizer
  const pixelsPerSecond = useSelector(() => $store.timeline.getPixelsPerSecond.get());
  const totalWidth = useSelector(() => $store.timeline.getTotalWidth.get());

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: chunks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      // Last chunk may be shorter
      const chunkDuration =
        index === chunks.length - 1
          ? duration - index * CHUNK_DURATION
          : CHUNK_DURATION;
      return chunkDuration * pixelsPerSecond;
    },
    overscan: 2,
  });

  // Re-measure when zoom changes
  useEffect(() => {
    if (chunks.length > 0) {
      virtualizer.measure();
    }
  }, [pixelsPerSecond, virtualizer, chunks.length]);

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

  if (chunks.length === 0) return null;

  return (
    <div className="relative flex-1 overflow-hidden">
      <svg
        aria-hidden="true"
        className="h-full"
        height={WAVEFORM_HEIGHT}
        style={{ width: totalWidth }}
        viewBox={`0 0 ${totalWidth} ${WAVEFORM_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const chunk = chunks[virtualItem.index];
          if (!chunk || chunk.nativeWidth === 0) return null;

          // Calculate scale to stretch/compress path to match chunk width at current zoom
          const desiredWidth = chunk.duration * pixelsPerSecond;
          const scaleX = desiredWidth / chunk.nativeWidth;

          return (
            <path
              key={virtualItem.key}
              className="fill-primary/70"
              d={chunk.pathD}
              transform={`translate(${virtualItem.start}, 0) scale(${scaleX}, 1)`}
            />
          );
        })}
      </svg>
    </div>
  );
}

const BAR_WIDTH = 1; // Fixed bar width in path coordinates

/**
 * Create waveform chunks from parsed peaks.
 * Each chunk contains peaks for a 10-second segment with pre-generated path.
 */
function createWaveformChunks(
  peaks: Float32Array,
  header: WaveformDatHeader,
  duration: number,
): WaveformChunk[] {
  const peaksPerSecond = header.sampleRate / header.samplesPerPixel;
  const peaksPerChunk = Math.ceil(CHUNK_DURATION * peaksPerSecond);
  const chunkCount = getChunkCount(duration);

  const chunks: WaveformChunk[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const startPeak = i * peaksPerChunk;
    const endPeak = Math.min(startPeak + peaksPerChunk, peaks.length);
    const chunkPeaks = peaks.slice(startPeak, endPeak);

    // Calculate chunk duration (last chunk may be shorter)
    const chunkStartTime = i * CHUNK_DURATION;
    const chunkEndTime = Math.min((i + 1) * CHUNK_DURATION, duration);
    const chunkDuration = chunkEndTime - chunkStartTime;

    // Downsample if too many peaks in this chunk
    const downsampledPeaks =
      chunkPeaks.length > MAX_PEAKS_PER_CHUNK
        ? downsamplePeaks(chunkPeaks, MAX_PEAKS_PER_CHUNK)
        : chunkPeaks;

    // Generate path for this chunk (coordinates are relative to chunk start)
    const pathD = generateChunkPath(downsampledPeaks, WAVEFORM_HEIGHT);

    // Native width is the number of rendered peaks times bar width
    const nativeWidth = downsampledPeaks.length * BAR_WIDTH;

    chunks.push({
      index: i,
      pathD,
      nativeWidth,
      duration: chunkDuration,
    });
  }

  return chunks;
}

/**
 * Generate SVG path for a chunk.
 * Coordinates are relative (starting at x=0) - transform handles positioning and scaling.
 */
function generateChunkPath(peaks: Float32Array, height: number): string {
  if (peaks.length === 0) return "";

  // Bar gap as fraction of bar width (will scale with transform)
  const barGap = BAR_WIDTH * 0.2;
  const effectiveBarWidth = BAR_WIDTH - barGap;
  const cornerRadius = Math.min(BAR_WIDTH * 0.15, effectiveBarWidth / 2);

  const pathCommands: string[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i] ?? 0;
    const barHeight = Math.max(2, peak * (height - 4));
    const x = i * BAR_WIDTH;
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

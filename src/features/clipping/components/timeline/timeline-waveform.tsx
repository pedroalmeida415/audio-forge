"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { area, curveLinear } from "d3-shape";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type WaveformData from "waveform-data";

import { Skeleton } from "~/components/ui/skeleton";
import { useClippingStore } from "../../_context/store.context";
import { useWaveformData } from "../../_hooks/use-waveform-data";
import {
  CHUNK_DURATION,
  getChunkCount,
  getVisibleChunkIndices,
} from "../../_utils/chunk-utils";

const WAVEFORM_HEIGHT = 60;
const OVERSCAN = 1;

// Target pixels per data point for LOD (lower = more points = more detail)
const TARGET_PIXELS_PER_POINT = 1;

// Minimum amplitude fraction for silent sections (ensures visible baseline)
const MIN_AMPLITUDE_FRACTION = 0.02;

interface ChunkRenderData {
  index: number;
  pathD: string;
}

interface WaveformPoint {
  x: number;
  min: number;
  max: number;
}

/**
 * Waveform visualization using waveform-data.js + D3 for virtualization.
 *
 * - Filled area envelope (D3 area + curveLinear for sharp peaks)
 * - waveform-data.js resample() for peak-preserving LOD
 * - Global peak normalization for consistent amplitude display
 * - D3 data join pattern for chunk virtualization
 * - Legend-State observe() for reactive updates
 */
export function TimelineWaveform() {
  const $store = useClippingStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const waveformRef = useRef<WaveformData | null>(null);
  const peakAmplitudeRef = useRef<number>(1);

  // Get fileId from store
  const fileId = useSelector(() => $store.fileId.get());

  // Load waveform data from R2 via API
  const { waveform, isLoading, status, error } = useWaveformData({
    fileId,
  });

  // Store waveform and calculate actual peak amplitude for normalization
  useEffect(() => {
    waveformRef.current = waveform;
    if (waveform) {
      peakAmplitudeRef.current = calculatePeakAmplitude(waveform);
    }
  }, [waveform]);

  // Subscribe to container width for SVG sizing
  const containerWidth = useSelector(() =>
    $store.timeline.containerWidth.get(),
  );

  // Reactive rendering via observe()
  useEffect(() => {
    if (!waveform || !svgRef.current) return;

    const svg = select(svgRef.current);

    const dispose = observe(() => {
      const currentWaveform = waveformRef.current;
      if (!currentWaveform) return;

      const scrollOffset = $store.timeline.scrollOffset.get();
      const containerW = $store.timeline.containerWidth.get();

      // Use waveform's own duration (more reliable than store during initial load)
      const duration = currentWaveform.duration;

      if (duration <= 0 || containerW <= 0) return;

      // Get pps from store, but fallback to simple calculation if store duration not set
      let pps = $store.timeline.getPixelsPerSecond.get();
      if (!pps || pps <= 0 || !Number.isFinite(pps)) {
        // Fallback: show entire waveform at default zoom
        pps = containerW / duration;
      }

      // Calculate visible chunks
      const { startIndex, endIndex } = getVisibleChunkIndices(
        scrollOffset,
        containerW,
        pps,
        duration,
        OVERSCAN,
      );

      // Use global peak for normalization
      const peakAmplitude = peakAmplitudeRef.current;

      // Build chunk render data
      const chunksData: ChunkRenderData[] = [];

      for (let i = startIndex; i <= endIndex; i++) {
        const chunkData = generateChunkPath(
          currentWaveform,
          i,
          pps,
          duration,
          scrollOffset,
          containerW,
          peakAmplitude,
        );
        if (chunkData) {
          chunksData.push(chunkData);
        }
      }

      // D3 data join for virtualized chunks - filled area envelope
      svg
        .selectAll<SVGPathElement, ChunkRenderData>("path.waveform-chunk")
        .data(chunksData, (d) => d.index)
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", "waveform-chunk fill-primary/70")
              .attr("d", (d) => d.pathD),
          (update) => update.attr("d", (d) => d.pathD),
          (exit) => exit.remove(),
        );
    });

    return () => {
      dispose();
      svg.selectAll("path.waveform-chunk").remove();
    };
  }, [waveform, $store]);

  // Loading states: pending or processing waveform generation
  if (isLoading || status === "pending" || status === "processing") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">
          {status === "processing"
            ? "Generating waveform..."
            : "Preparing waveform..."}
        </span>
      </div>
    );
  }

  // Error or failed state
  if (error || status === "failed") {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <span className="text-muted-foreground text-sm">
          {error ?? "Failed to generate waveform"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-1 flex-col justify-center overflow-hidden">
      <svg
        ref={svgRef}
        aria-hidden="true"
        height={WAVEFORM_HEIGHT}
        width={containerWidth}
        viewBox={`0 0 ${containerWidth} ${WAVEFORM_HEIGHT}`}
        preserveAspectRatio="none"
      />
    </div>
  );
}

/**
 * Calculate the actual peak amplitude in the waveform.
 * This is used for global normalization so the loudest part reaches max height.
 */
function calculatePeakAmplitude(waveform: WaveformData): number {
  const channel = waveform.channel(0);
  const minArray = channel.min_array();
  const maxArray = channel.max_array();

  let peak = 0;
  for (let i = 0; i < waveform.length; i++) {
    const minVal = Math.abs(minArray[i] ?? 0);
    const maxVal = Math.abs(maxArray[i] ?? 0);
    peak = Math.max(peak, minVal, maxVal);
  }

  // Return at least 1 to avoid division by zero
  return Math.max(1, peak);
}

/**
 * Generate SVG path data for a single chunk using D3 area generator.
 * Uses smooth curves with proper peak normalization.
 */
function generateChunkPath(
  waveform: WaveformData,
  chunkIndex: number,
  pps: number,
  duration: number,
  scrollOffset: number,
  containerWidth: number,
  peakAmplitude: number,
): ChunkRenderData | null {
  const chunkCount = getChunkCount(duration);
  if (chunkIndex < 0 || chunkIndex >= chunkCount) return null;

  const chunkStartTime = chunkIndex * CHUNK_DURATION;
  const chunkEndTime = Math.min((chunkIndex + 1) * CHUNK_DURATION, duration);
  const chunkDuration = chunkEndTime - chunkStartTime;

  if (chunkDuration <= 0) return null;

  // Calculate pixel dimensions
  const chunkPixelWidth = chunkDuration * pps;
  const chunkStartPx = chunkStartTime * pps;
  const offsetX = chunkStartPx - scrollOffset;

  // Early exit if chunk is completely outside viewport
  if (offsetX + chunkPixelWidth < 0 || offsetX > containerWidth) {
    return null;
  }

  // Slice waveform for this chunk using time-based slicing
  let chunkWaveform: WaveformData;
  try {
    chunkWaveform = waveform.slice({
      startTime: chunkStartTime,
      endTime: chunkEndTime,
    });
  } catch {
    return null;
  }

  if (chunkWaveform.length === 0) return null;

  // Calculate target points for LOD based on pixel width
  const targetPoints = Math.max(
    10,
    Math.floor(chunkPixelWidth / TARGET_PIXELS_PER_POINT),
  );

  // Use waveform-data.js resample for LOD (peak-preserving downsampling)
  // Only resample if we have more points than needed
  const resampled =
    chunkWaveform.length > targetPoints
      ? chunkWaveform.resample({ width: targetPoints })
      : chunkWaveform;

  const channel = resampled.channel(0);
  const minArray = channel.min_array();
  const maxArray = channel.max_array();

  // Minimum threshold for silent sections
  const minThreshold = peakAmplitude * MIN_AMPLITUDE_FRACTION;

  // Build data points for D3 area
  const points: WaveformPoint[] = [];
  const numPoints = minArray.length;

  for (let i = 0; i < numPoints; i++) {
    // Position points at exact intervals from chunk start to chunk end
    const x = offsetX + (i / Math.max(1, numPoints - 1)) * chunkPixelWidth;

    let min = minArray[i] ?? 0;
    let max = maxArray[i] ?? 0;

    // Ensure minimum visible amplitude for silent sections
    if (Math.abs(max - min) < minThreshold * 2) {
      min = -minThreshold;
      max = minThreshold;
    }

    points.push({ x, min, max });
  }

  // Handle single-point edge case
  if (points.length === 1 && points[0]) {
    points[0].x = offsetX + chunkPixelWidth / 2;
  }

  // Filter to visible points for clipping
  const visiblePoints = points.filter(
    (p) =>
      p.x >= -chunkPixelWidth * 0.1 &&
      p.x <= containerWidth + chunkPixelWidth * 0.1,
  );

  if (visiblePoints.length === 0) return null;

  // Create y-scale normalized to actual peak amplitude (full height)
  const yScale = scaleLinear()
    .domain([-peakAmplitude, peakAmplitude])
    .range([WAVEFORM_HEIGHT, 0])
    .clamp(true);

  // Create D3 area generator for filled envelope (curveLinear for sharp peaks)
  const areaGenerator = area<WaveformPoint>()
    .x((d) => d.x)
    .y0((d) => yScale(d.min))
    .y1((d) => yScale(d.max))
    .curve(curveLinear);

  const pathD = areaGenerator(visiblePoints);

  if (!pathD) return null;

  return {
    index: chunkIndex,
    pathD,
  };
}

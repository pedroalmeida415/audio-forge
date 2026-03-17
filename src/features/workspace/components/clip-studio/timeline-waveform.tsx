"use client";

import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { area, curveLinear } from "d3-shape";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { effect } from "valtio-reactive";
import type WaveformData from "waveform-data";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { useWaveformData } from "~/features/workspace/hooks/use-waveform-data";
import {
  CHUNK_DURATION,
  getChunkCount,
  getVisibleChunkIndices,
} from "~/features/workspace/utils/chunk-utils";

const WAVEFORM_HEIGHT = 60;
const OVERSCAN = 1;

// Target pixels per data point for LOD (lower = more points = more detail)
const TARGET_PIXELS_PER_POINT = 1;

interface ChunkRenderData {
  index: number;
  pathD: string;
}

interface TimelineWaveformProps {
  sourceId: string;
}

/**
 * Waveform visualization using waveform-data.js + D3.
 *
 * - Outlined envelope (forward through max, backward through min → one continuous stroke)
 * - Center line at 0 amplitude
 * - waveform-data.js resample() for peak-preserving LOD
 * - Global peak normalization for consistent amplitude display
 * - D3 data join pattern for chunk virtualization
 * - Valtio effect() for reactive updates
 */
export function TimelineWaveform({ sourceId }: TimelineWaveformProps) {
  const { store, computed } = useWorkspaceStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const waveformRef = useRef<WaveformData | null>(null);
  const peakAmplitudeRef = useRef<number>(1);

  // Load waveform data from R2 via API
  const { waveform, isLoading, status, error } = useWaveformData({
    sourceId,
  });

  // Store waveform and calculate actual peak amplitude for normalization
  useEffect(() => {
    waveformRef.current = waveform;
    if (waveform) {
      peakAmplitudeRef.current = calculatePeakAmplitude(waveform);
    }
  }, [waveform]);

  // Reactive rendering via effect()
  useEffect(() => {
    if (!waveform || !svgRef.current) return;

    const svg = select(svgRef.current);

    // Create center line at 0 amplitude
    let centerLine = svg.select<SVGLineElement>("line.center-line");
    if (centerLine.empty()) {
      centerLine = svg
        .append("line")
        .attr("class", "center-line")
        .attr("y1", WAVEFORM_HEIGHT / 2)
        .attr("y2", WAVEFORM_HEIGHT / 2)
        .attr("stroke", "currentColor")
        .attr("stroke-width", 1)
        .attr("shape-rendering", "crispEdges");
    }

    const dispose = effect(() => {
      const currentWaveform = waveformRef.current;
      if (!currentWaveform) return;

      const scrollOffset = store.scrollOffset;
      const containerW = store.containerWidth;

      // Use waveform's own duration (more reliable than store during initial load)
      const duration = currentWaveform.duration;

      if (duration <= 0 || containerW <= 0) return;

      // Set SVG dimensions via DOM (avoids React re-render + D3 conflict)
      const svgEl = svgRef.current;
      if (svgEl) {
        svgEl.setAttribute("width", String(containerW));
        svgEl.setAttribute("viewBox", `0 0 ${containerW} ${WAVEFORM_HEIGHT}`);
      }

      // Update center line to span container width
      centerLine.attr("x1", 0).attr("x2", containerW);

      // Get pps from computed, but fallback to simple calculation if store duration not set
      let pps = computed.pixelsPerSecond;
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

      // D3 data join — filled area envelope
      svg
        .selectAll<SVGPathElement, ChunkRenderData>("path.waveform-chunk")
        .data(chunksData, (d) => d.index)
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", "waveform-chunk")
              .attr("fill", "currentColor")
              .attr("stroke", "none")
              .attr("d", (d) => d.pathD),
          (update) => update.attr("d", (d) => d.pathD),
          (exit) => exit.remove(),
        );
    });

    return () => {
      dispose();
      svg.selectAll("path.waveform-chunk").remove();
      svg.selectAll("line.center-line").remove();
    };
  }, [waveform, store, computed]);

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
    <div className="relative flex h-full flex-1 flex-col justify-center overflow-hidden text-primary">
      <svg
        ref={svgRef}
        aria-hidden="true"
        height={WAVEFORM_HEIGHT}
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

  const numPoints = minArray.length;
  if (numPoints === 0) return null;

  // Create y-scale normalized to actual peak amplitude (full height)
  const yScale = scaleLinear()
    .domain([-peakAmplitude, peakAmplitude])
    .range([WAVEFORM_HEIGHT, 0])
    .clamp(true);

  // Build data points for D3 area
  const points: { x: number; min: number; max: number }[] = [];

  // Filter margin for visibility
  const marginPx = chunkPixelWidth * 0.1;

  for (let i = 0; i < numPoints; i++) {
    const x = offsetX + (i / Math.max(1, numPoints - 1)) * chunkPixelWidth;
    if (x < -marginPx || x > containerWidth + marginPx) continue;

    const min = minArray[i] ?? 0;
    const max = maxArray[i] ?? 0;
    points.push({ x, min, max });
  }

  if (points.length === 0) return null;

  // Create D3 area generator for filled envelope
  const areaGenerator = area<{ x: number; min: number; max: number }>()
    .x((d) => d.x)
    .y0((d) => yScale(d.min))
    .y1((d) => yScale(d.max))
    .curve(curveLinear);

  const pathD = areaGenerator(points);

  if (!pathD) return null;

  return {
    index: chunkIndex,
    pathD,
  };
}

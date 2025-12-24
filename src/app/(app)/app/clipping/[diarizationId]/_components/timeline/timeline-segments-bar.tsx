"use client";

import { useSelector } from "@legendapp/state/react";
import { $React } from "@legendapp/state/react-web";
import { useMemo } from "react";
import { withAlpha } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";
import {
  CHUNK_DURATION,
  getChunkCount,
  getChunkForTime,
  getVisibleChunkIndices,
} from "../../_utils/chunk-utils";

const OVERSCAN = 2; // Number of chunks to render beyond visible area

/**
 * Segments bar with manual scroll handling.
 *
 * Uses transform: translateX for GPU-accelerated positioning.
 * Visibility calculated manually based on scrollOffset.
 */
export function TimelineSegmentsBar() {
  const $store = useClippingStore();

  // Subscribe to reactive values for chunk calculation
  const duration = useSelector(() => $store.playback.duration.get());
  const segments = useSelector(() => $store.segments.get());

  // Build segment-to-chunk mapping (stable unless segments/duration change)
  const { chunkCount, segmentsByChunk } = useMemo(() => {
    const count = getChunkCount(duration);
    const map = new Map<number, DiarizationSegment[]>();

    // Initialize empty arrays for all chunks
    for (let i = 0; i < count; i++) {
      map.set(i, []);
    }

    // Map each segment to the chunk where it starts
    for (const segment of segments) {
      if (segment.isDeleted) continue;

      const startChunk = getChunkForTime(segment.start);
      const existing = map.get(startChunk);
      if (existing) {
        existing.push(segment);
      }
    }

    return { chunkCount: count, segmentsByChunk: map };
  }, [duration, segments]);

  // Calculate visible chunk indices reactively
  const visibleChunks = useSelector(() => {
    const scrollOffset = $store.timeline.scrollOffset.get();
    const containerWidth = $store.timeline.containerWidth.get();
    const pps = $store.timeline.getPixelsPerSecond.get();
    const dur = $store.playback.duration.get();

    return getVisibleChunkIndices(scrollOffset, containerWidth, pps, dur, OVERSCAN);
  });

  if (chunkCount === 0) return null;

  // Generate array of visible chunk indices
  const visibleChunkIndices: number[] = [];
  for (let i = visibleChunks.startIndex; i <= visibleChunks.endIndex; i++) {
    visibleChunkIndices.push(i);
  }

  return (
    <div className="relative h-8 shrink-0 overflow-hidden">
      {visibleChunkIndices.map((chunkIndex) => {
        const chunkSegments = segmentsByChunk.get(chunkIndex) ?? [];

        return (
          <SegmentChunk
            key={chunkIndex}
            chunkIndex={chunkIndex}
            segments={chunkSegments}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Segment Chunk Component
// ============================================================================

interface SegmentChunkProps {
  chunkIndex: number;
  segments: DiarizationSegment[];
}

function SegmentChunk({ chunkIndex, segments }: SegmentChunkProps) {
  const $store = useClippingStore();

  return (
    <$React.div
      className="absolute top-0 h-full"
      style={{ willChange: "transform, width" }}
      $style={() => {
        const pps = $store.timeline.getPixelsPerSecond.get();
        const scrollOffset = $store.timeline.scrollOffset.get();
        const chunkStartPx = chunkIndex * CHUNK_DURATION * pps;
        const chunkWidth = CHUNK_DURATION * pps;

        return {
          transform: `translateX(${chunkStartPx - scrollOffset}px)`,
          width: chunkWidth,
        };
      }}
    >
      {segments.map((segment) => (
        <TimelineSegment key={segment.id} segment={segment} />
      ))}
    </$React.div>
  );
}

// ============================================================================
// Timeline Segment Component
// ============================================================================

interface TimelineSegmentProps {
  segment: DiarizationSegment;
}

function TimelineSegment({ segment }: TimelineSegmentProps) {
  const $store = useClippingStore();
  const { id, speaker, start, end } = segment;

  // Calculate chunk start position from segment's start time
  // This avoids receiving chunkStartPx as a prop that changes on zoom
  const chunkIndex = getChunkForTime(start);

  return (
    <$React.button
      type="button"
      onClick={() => $store.setActiveSegment(id)}
      $className={() => {
        const isActive = id === $store.activeSegmentId.get();
        const selectedSpeaker = $store.selectedSpeaker.get();
        const isDimmed = selectedSpeaker !== null && speaker !== selectedSpeaker;
        return cn(
          "absolute top-1 h-6 overflow-hidden rounded border text-left transition-[opacity,filter]",
          isActive
            ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
            : "hover:brightness-110",
          isDimmed && "opacity-25 grayscale",
        );
      }}
      $style={() => {
        const pps = $store.timeline.getPixelsPerSecond.get();
        const color = $store.speakerColors[speaker]?.get();
        const selectedSpeaker = $store.selectedSpeaker.get();
        const isDimmed = selectedSpeaker !== null && speaker !== selectedSpeaker;

        // Calculate positions - chunk start derived from chunk index
        const chunkStartPx = chunkIndex * CHUNK_DURATION * pps;
        const segmentStartPx = start * pps;
        const leftInChunk = segmentStartPx - chunkStartPx;

        return {
          left: leftInChunk,
          width: Math.max((end - start) * pps, 4),
          backgroundColor: isDimmed
            ? "rgba(100, 100, 100, 0.3)"
            : color && withAlpha(color, 0.4),
          borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color,
        };
      }}
    >
      {/* Segment label - only shows when width > 50px */}
      <$React.span
        className="block truncate px-2 font-mono text-[10px] leading-6"
        $style={() => {
          const pps = $store.timeline.getPixelsPerSecond.get();
          const width = (end - start) * pps;

          if (width <= 50) {
            return { display: "none" };
          }

          const selectedSpeaker = $store.selectedSpeaker.get();
          const isDimmed = selectedSpeaker !== null && speaker !== selectedSpeaker;
          const color = $store.speakerColors[speaker]?.get();

          return {
            display: "block",
            color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color,
          };
        }}
      >
        {$store.speakerCollections[speaker]?.collectionName.get() ?? speaker}
      </$React.span>
    </$React.button>
  );
}

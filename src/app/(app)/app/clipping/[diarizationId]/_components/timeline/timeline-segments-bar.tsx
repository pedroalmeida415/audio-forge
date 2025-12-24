"use client";

import { useSelector } from "@legendapp/state/react";
import { $React } from "@legendapp/state/react-web";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo } from "react";
import { withAlpha } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";
import {
  CHUNK_DURATION,
  getChunkCount,
  getChunkForTime,
} from "../../_utils/chunk-utils";

/**
 * Virtualized segments bar.
 *
 * Groups segments by chunk (10-second intervals) and only renders
 * segments in visible chunks using TanStack Virtual.
 */
export function TimelineSegmentsBar() {
  const $store = useClippingStore();
  const { scrollContainerRef } = $store.playback.peek().refs;

  // Subscribe to reactive values
  const duration = useSelector(() => $store.playback.duration.get());
  const pixelsPerSecond = useSelector(() =>
    $store.timeline.getPixelsPerSecond.get(),
  );
  const segments = useSelector(() => $store.segments.get());

  // Build segment-to-chunk mapping
  const { chunkCount, segmentsByChunk } = useMemo(() => {
    const count = getChunkCount(duration);
    const map = new Map<number, DiarizationSegment[]>();

    // Initialize empty arrays for all chunks
    for (let i = 0; i < count; i++) {
      map.set(i, []);
    }

    // Map each segment to the chunk where it starts
    // (segments render in their starting chunk only to avoid duplicates)
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

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: chunkCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => CHUNK_DURATION * pixelsPerSecond,
    overscan: 2,
  });

  // Re-measure when zoom changes
  useEffect(() => {
    virtualizer.measure();
  }, [pixelsPerSecond, virtualizer]);

  if (chunkCount === 0) return null;

  return (
    <div className="relative h-8 shrink-0">
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const chunkSegments = segmentsByChunk.get(virtualItem.index) ?? [];

        return (
          <div
            key={virtualItem.key}
            className="absolute top-0 h-full"
            style={{
              left: virtualItem.start,
              width: virtualItem.size,
            }}
          >
            {chunkSegments.map((segment) => (
              <TimelineSegment
                key={segment.id}
                segment={segment}
                chunkStartPx={virtualItem.start}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Timeline Segment Component
// ============================================================================

interface TimelineSegmentProps {
  segment: DiarizationSegment;
  chunkStartPx: number;
}

function TimelineSegment({ segment, chunkStartPx }: TimelineSegmentProps) {
  const $store = useClippingStore();
  const { id, speaker, start, end } = segment;

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

        // Position relative to parent chunk container
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

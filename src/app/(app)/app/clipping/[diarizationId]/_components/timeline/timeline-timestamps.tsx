"use client";

import { useSelector } from "@legendapp/state/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";
import {
  CHUNK_DURATION,
  getChunkCount,
  getChunkTimeRange,
} from "../../_utils/chunk-utils";

/**
 * Virtualized timeline timestamps.
 *
 * Generates timestamp marks per chunk and only renders visible chunks
 * using TanStack Virtual.
 */
export function TimelineTimestamps() {
  const $store = useClippingStore();
  const { scrollContainerRef } = $store.playback.peek().refs;

  // Subscribe to reactive values
  const duration = useSelector(() => $store.playback.duration.get());
  const pixelsPerSecond = useSelector(() =>
    $store.timeline.getPixelsPerSecond.get(),
  );
  const visibleTimespan = useSelector(() =>
    $store.timeline.getVisibleTimespan.get(),
  );

  const chunkCount = useMemo(() => getChunkCount(duration), [duration]);

  // Calculate intervals based on visible timespan
  const { majorInterval, minorInterval } = useMemo(
    () => getMarkIntervals(visibleTimespan),
    [visibleTimespan],
  );

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: chunkCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => CHUNK_DURATION * pixelsPerSecond,
    overscan: 1,
  });

  // Re-measure when zoom changes
  useEffect(() => {
    virtualizer.measure();
  }, [pixelsPerSecond, virtualizer]);

  if (chunkCount === 0) return null;

  return (
    <div className="pointer-events-none relative h-6 shrink-0 overflow-hidden border-b bg-muted/30">
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <TimestampChunk
          key={virtualItem.key}
          chunkIndex={virtualItem.index}
          chunkStartPx={virtualItem.start}
          chunkWidth={virtualItem.size}
          duration={duration}
          pixelsPerSecond={pixelsPerSecond}
          majorInterval={majorInterval}
          minorInterval={minorInterval}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Timestamp Chunk Component
// ============================================================================

interface TimestampChunkProps {
  chunkIndex: number;
  chunkStartPx: number;
  chunkWidth: number;
  duration: number;
  pixelsPerSecond: number;
  majorInterval: number;
  minorInterval: number;
}

function TimestampChunk({
  chunkIndex,
  chunkStartPx,
  chunkWidth,
  duration,
  pixelsPerSecond,
  majorInterval,
  minorInterval,
}: TimestampChunkProps) {
  const timeRange = getChunkTimeRange(chunkIndex, duration);

  // Generate marks for this chunk
  const marks = useMemo(() => {
    const result: { time: number; major: boolean }[] = [];

    // Start from the first minor interval at or after chunk start
    const firstMark = Math.ceil(timeRange.start / minorInterval) * minorInterval;

    for (let t = firstMark; t <= timeRange.end; t += minorInterval) {
      // Avoid floating point issues
      const time = Math.round(t * 1000) / 1000;
      if (time > duration) break;

      result.push({
        time,
        major: time % majorInterval < 0.001, // Handle floating point
      });
    }

    return result;
  }, [timeRange.start, timeRange.end, duration, majorInterval, minorInterval]);

  return (
    <div
      className="absolute top-0 h-full"
      style={{
        left: chunkStartPx,
        width: chunkWidth,
      }}
    >
      {marks.map((mark) => {
        // Position relative to chunk
        const leftInChunk = (mark.time - timeRange.start) * pixelsPerSecond;

        return (
          <div
            className="absolute top-0 flex h-full flex-col items-center"
            key={mark.time}
            style={{ left: leftInChunk }}
          >
            {mark.major ? (
              <>
                <div className="h-2 w-px bg-muted-foreground/50" />
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {formatTimestamp(mark.time)}
                </span>
              </>
            ) : (
              <div className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/30" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get mark intervals based on visible timespan.
 */
function getMarkIntervals(visibleTimespan: number): {
  majorInterval: number;
  minorInterval: number;
} {
  if (visibleTimespan <= 30) {
    // Very zoomed in: show 2s majors, 0.5s minors
    return { majorInterval: 2, minorInterval: 0.5 };
  }
  if (visibleTimespan <= 60) {
    // Moderately zoomed: show 5s majors, 1s minors
    return { majorInterval: 5, minorInterval: 1 };
  }
  if (visibleTimespan <= 180) {
    // Less zoomed: show 10s majors, 2s minors
    return { majorInterval: 10, minorInterval: 2 };
  }
  if (visibleTimespan <= 600) {
    // Wide view: show 30s majors, 5s minors
    return { majorInterval: 30, minorInterval: 5 };
  }
  // Very wide view: show 60s majors, 10s minors
  return { majorInterval: 60, minorInterval: 10 };
}

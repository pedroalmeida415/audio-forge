"use client";

import { useSelector } from "@legendapp/state/react";
import { $React } from "@legendapp/state/react-web";
import { useMemo } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";
import {
  CHUNK_DURATION,
  getChunkCount,
  getChunkTimeRange,
  getVisibleChunkIndices,
} from "../../_utils/chunk-utils";

const OVERSCAN = 1; // Number of chunks to render beyond visible area

/**
 * Timeline timestamps with manual scroll handling.
 *
 * Uses transform: translateX for GPU-accelerated positioning.
 * Visibility calculated manually based on scrollOffset.
 */
export function TimelineTimestamps() {
  const $store = useClippingStore();

  // Subscribe to reactive values
  const duration = useSelector(() => $store.playback.duration.get());
  const visibleTimespan = useSelector(() =>
    $store.timeline.getVisibleTimespan.get(),
  );

  const chunkCount = useMemo(() => getChunkCount(duration), [duration]);

  // Calculate intervals based on visible timespan
  const { majorInterval, minorInterval } = useMemo(
    () => getMarkIntervals(visibleTimespan),
    [visibleTimespan],
  );

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
    <div className="pointer-events-none relative h-6 shrink-0 overflow-hidden border-b bg-muted/30">
      {visibleChunkIndices.map((chunkIndex) => (
        <TimestampChunk
          key={chunkIndex}
          chunkIndex={chunkIndex}
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
  majorInterval: number;
  minorInterval: number;
}

function TimestampChunk({
  chunkIndex,
  majorInterval,
  minorInterval,
}: TimestampChunkProps) {
  const $store = useClippingStore();
  const duration = useSelector(() => $store.playback.duration.get());
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
      {marks.map((mark) => (
        <TimestampMark
          key={mark.time}
          time={mark.time}
          major={mark.major}
          chunkStartTime={timeRange.start}
        />
      ))}
    </$React.div>
  );
}

// ============================================================================
// Timestamp Mark Component
// ============================================================================

interface TimestampMarkProps {
  time: number;
  major: boolean;
  chunkStartTime: number;
}

function TimestampMark({ time, major, chunkStartTime }: TimestampMarkProps) {
  const $store = useClippingStore();

  return (
    <$React.div
      className="absolute top-0 flex h-full flex-col items-center"
      $style={() => {
        const pps = $store.timeline.getPixelsPerSecond.get();
        return { left: (time - chunkStartTime) * pps };
      }}
    >
      {major ? (
        <>
          <div className="h-2 w-px bg-muted-foreground/50" />
          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {formatTimestamp(time)}
          </span>
        </>
      ) : (
        <div className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/30" />
      )}
    </$React.div>
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

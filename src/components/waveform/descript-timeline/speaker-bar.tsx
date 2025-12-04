"use client";

import { memo, useMemo } from "react";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { TIMELINE_CONSTANTS } from "./timeline-styles";

// Buffer pixels to render beyond visible area for smoother scrolling
const VIRTUALIZATION_BUFFER = 200;

type SpeakerBarProps = {
  segments: DiarizationSegment[];
  speakerColorMap: Map<string, number>;
  pxPerSec: number;
  selectedSegmentId: string | null;
  onSegmentClick: (segmentId: string) => void;
  scrollLeft: number;
  viewportWidth: number;
};

type PositionedSegment = DiarizationSegment & {
  x: number;
  width: number;
  colorIndex: number;
};

// Memoized segment button to prevent re-renders
const SegmentButton = memo(
  function SegmentButton({
    segment,
    isSelected,
    onClick,
  }: {
    segment: PositionedSegment;
    isSelected: boolean;
    onClick: () => void;
  }) {
    const color = getSpeakerColor(segment.colorIndex);

    return (
      <button
        className={cn(
          "absolute top-1 bottom-1 rounded-sm transition-all duration-150",
          "flex cursor-pointer items-center overflow-hidden",
          "hover:ring-2 hover:ring-ring/50",
          isSelected && "ring-2 ring-ring"
        )}
        onClick={onClick}
        style={{
          left: segment.x,
          width: Math.max(segment.width, 4),
          backgroundColor: isSelected
            ? color.bg.replace("0.4", "0.6")
            : color.bg,
          borderLeft: `2px solid ${color.border}`,
        }}
        type="button"
      >
        {segment.width > 40 && (
          <span
            className="truncate px-1.5 font-medium text-[11px]"
            style={{ color: color.border }}
          >
            {segment.speaker}
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.segment.id === next.segment.id &&
    prev.segment.x === next.segment.x &&
    prev.segment.width === next.segment.width
);

export function SpeakerBar({
  segments,
  speakerColorMap,
  pxPerSec,
  selectedSegmentId,
  onSegmentClick,
  scrollLeft,
  viewportWidth,
}: SpeakerBarProps) {
  // Position all segments
  const allPositionedSegments = useMemo(
    (): PositionedSegment[] =>
      segments.map((seg) => {
        const x = seg.start * pxPerSec;
        const width = (seg.end - seg.start) * pxPerSec;
        const colorIndex = speakerColorMap.get(seg.speaker) ?? 0;
        return { ...seg, x, width, colorIndex };
      }),
    [segments, pxPerSec, speakerColorMap]
  );

  // Filter to only segments visible in viewport (with buffer)
  const visibleSegments = useMemo(() => {
    const visibleStart = scrollLeft - VIRTUALIZATION_BUFFER;
    const visibleEnd = scrollLeft + viewportWidth + VIRTUALIZATION_BUFFER;

    return allPositionedSegments.filter((seg) => {
      const segEnd = seg.x + seg.width;
      return segEnd >= visibleStart && seg.x <= visibleEnd;
    });
  }, [allPositionedSegments, scrollLeft, viewportWidth]);

  // Calculate gaps between segments (use all segments for correct gap calculation)
  const gaps = useMemo(() => {
    const sortedSegments = [...allPositionedSegments].sort(
      (a, b) => a.start - b.start
    );
    const result: { x: number; width: number; duration: number }[] = [];

    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const current = sortedSegments[i];
      const next = sortedSegments[i + 1];
      if (!(current && next)) {
        continue;
      }

      const gapStart = current.end;
      const gapEnd = next.start;
      const gapDuration = gapEnd - gapStart;

      if (gapDuration > 0.05) {
        const x = gapStart * pxPerSec;
        const width = gapDuration * pxPerSec;
        result.push({ x, width, duration: gapDuration });
      }
    }

    return result;
  }, [allPositionedSegments, pxPerSec]);

  // Filter gaps to only visible ones
  const visibleGaps = useMemo(() => {
    const visibleStart = scrollLeft - VIRTUALIZATION_BUFFER;
    const visibleEnd = scrollLeft + viewportWidth + VIRTUALIZATION_BUFFER;

    return gaps.filter((gap) => {
      const gapEnd = gap.x + gap.width;
      return gapEnd >= visibleStart && gap.x <= visibleEnd;
    });
  }, [gaps, scrollLeft, viewportWidth]);

  // Calculate background bar bounds (use all segments for correct positioning)
  const backgroundBounds = useMemo(() => {
    if (allPositionedSegments.length === 0) {
      return null;
    }
    const minX = Math.min(...allPositionedSegments.map((s) => s.x));
    const maxX = Math.max(...allPositionedSegments.map((s) => s.x + s.width));
    return { left: minX, width: maxX - minX };
  }, [allPositionedSegments]);

  return (
    <div
      className="relative border-border/30 border-b bg-muted/20"
      style={{ height: TIMELINE_CONSTANTS.SPEAKER_BAR_HEIGHT }}
    >
      {/* Background bar showing content area */}
      {backgroundBounds && (
        <div
          className="absolute top-1 bottom-1 rounded-sm bg-muted/40"
          style={{
            left: backgroundBounds.left,
            width: backgroundBounds.width,
          }}
        />
      )}

      {/* Gaps between segments (virtualized) */}
      {visibleGaps.map((gap) => (
        <div
          className="absolute top-1 bottom-1 flex items-center justify-center"
          key={`gap-${gap.x}`}
          style={{ left: gap.x, width: gap.width }}
        >
          {gap.width > 30 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {gap.duration.toFixed(2)}s
            </span>
          )}
        </div>
      ))}

      {/* Speaker segments (virtualized) */}
      {visibleSegments.map((segment) => (
        <SegmentButton
          isSelected={segment.id === selectedSegmentId}
          key={segment.id}
          onClick={() => onSegmentClick(segment.id)}
          segment={segment}
        />
      ))}
    </div>
  );
}

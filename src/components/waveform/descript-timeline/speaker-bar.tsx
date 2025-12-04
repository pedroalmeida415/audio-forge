"use client";

import { useMemo } from "react";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { TIMELINE_CONSTANTS } from "./timeline-styles";

type SpeakerBarProps = {
  segments: DiarizationSegment[];
  speakerColorMap: Map<string, number>;
  pxPerSec: number;
  scrollX: number;
  containerWidth: number;
  selectedSegmentId: string | null;
  onSegmentClick: (segmentId: string) => void;
};

type VisibleSegment = DiarizationSegment & {
  x: number;
  width: number;
  colorIndex: number;
};

export function SpeakerBar({
  segments,
  speakerColorMap,
  pxPerSec,
  scrollX,
  containerWidth,
  selectedSegmentId,
  onSegmentClick,
}: SpeakerBarProps) {
  const visibleSegments = useMemo((): VisibleSegment[] => {
    const visibleStartTime = Math.max(0, (scrollX - 50) / pxPerSec);
    const visibleEndTime = (scrollX + containerWidth + 50) / pxPerSec;

    return segments
      .filter(
        (seg) =>
          seg.end > visibleStartTime && seg.start < visibleEndTime
      )
      .map((seg) => {
        const x = seg.start * pxPerSec - scrollX;
        const width = (seg.end - seg.start) * pxPerSec;
        const colorIndex = speakerColorMap.get(seg.speaker) ?? 0;
        return { ...seg, x, width, colorIndex };
      });
  }, [segments, pxPerSec, scrollX, containerWidth, speakerColorMap]);

  // Calculate gaps between segments
  const gaps = useMemo(() => {
    const sortedSegments = [...visibleSegments].sort((a, b) => a.start - b.start);
    const result: { x: number; width: number; duration: number }[] = [];

    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const current = sortedSegments[i];
      const next = sortedSegments[i + 1];
      if (!current || !next) continue;

      const gapStart = current.end;
      const gapEnd = next.start;
      const gapDuration = gapEnd - gapStart;

      if (gapDuration > 0.05) {
        const x = gapStart * pxPerSec - scrollX;
        const width = gapDuration * pxPerSec;
        result.push({ x, width, duration: gapDuration });
      }
    }

    return result;
  }, [visibleSegments, pxPerSec, scrollX]);

  return (
    <div
      className="relative bg-muted/20 border-b border-border/30"
      style={{ height: TIMELINE_CONSTANTS.SPEAKER_BAR_HEIGHT }}
    >
      {/* Background bar showing content area */}
      {visibleSegments.length > 0 && (
        <div
          className="absolute top-1 bottom-1 bg-muted/40 rounded-sm"
          style={{
            left: Math.min(...visibleSegments.map((s) => s.x)),
            width:
              Math.max(...visibleSegments.map((s) => s.x + s.width)) -
              Math.min(...visibleSegments.map((s) => s.x)),
          }}
        />
      )}

      {/* Gaps between segments */}
      {gaps.map((gap, i) => (
        <div
          key={`gap-${i}`}
          className="absolute top-1 bottom-1 flex items-center justify-center"
          style={{ left: gap.x, width: gap.width }}
        >
          {gap.width > 30 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {gap.duration.toFixed(2)}s
            </span>
          )}
        </div>
      ))}

      {/* Speaker segments */}
      {visibleSegments.map((segment) => {
        const color = getSpeakerColor(segment.colorIndex);
        const isSelected = segment.id === selectedSegmentId;

        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onSegmentClick(segment.id)}
            className={cn(
              "absolute top-1 bottom-1 rounded-sm transition-all duration-150",
              "flex items-center overflow-hidden cursor-pointer",
              "hover:ring-2 hover:ring-ring/50",
              isSelected && "ring-2 ring-ring"
            )}
            style={{
              left: segment.x,
              width: Math.max(segment.width, 4),
              backgroundColor: isSelected
                ? color.bg.replace("0.4", "0.6")
                : color.bg,
              borderLeft: `2px solid ${color.border}`,
            }}
          >
            {segment.width > 40 && (
              <span
                className="px-1.5 text-[11px] font-medium truncate"
                style={{ color: color.border }}
              >
                {segment.speaker}
              </span>
            )}

            {/* Trim handles (visible on hover/selection) */}
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity",
                isSelected && "opacity-50"
              )}
              style={{ backgroundColor: color.border }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <div
              className={cn(
                "absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity",
                isSelected && "opacity-50"
              )}
              style={{ backgroundColor: color.border }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";

interface Segment {
  id: string;
  speaker: string;
  start: number;
  end: number;
}

interface TimelineSegmentsBarProps {
  segments: Segment[];
  selectedSegmentId: string | null;
  timeToPixels: (time: number) => number;
  onSegmentClick: (segmentId: string) => void;
  getSpeakerColorIndex: (speaker: string) => number;
}

export function TimelineSegmentsBar({
  segments,
  selectedSegmentId,
  timeToPixels,
  onSegmentClick,
  getSpeakerColorIndex,
}: TimelineSegmentsBarProps) {
  return (
    <div className="relative h-8 shrink-0">
      {segments.map((segment) => {
        const colorIndex = getSpeakerColorIndex(segment.speaker);
        const color = getSpeakerColor(colorIndex);
        const left = timeToPixels(segment.start);
        const width = timeToPixels(segment.end) - left;
        const isSelected = segment.id === selectedSegmentId;

        return (
          <button
            className={cn(
              "absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
              isSelected
                ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "hover:brightness-110",
            )}
            key={segment.id}
            onClick={() => onSegmentClick(segment.id)}
            style={{
              left,
              width: Math.max(width, 4),
              backgroundColor: color.bg,
              borderColor: color.border,
            }}
            type="button"
          >
            {width > 50 && (
              <span
                className="block truncate px-1 font-mono text-[10px] leading-6"
                style={{ color: color.border }}
              >
                {segment.speaker}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

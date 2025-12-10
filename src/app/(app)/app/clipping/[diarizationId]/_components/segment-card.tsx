"use client";

import { Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { formatDuration, formatTimeRange } from "~/lib/time-utils";
import { cn } from "~/lib/utils";

interface Segment {
  id: string;
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
}

interface SegmentCardProps {
  segment: Segment;
  colorIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  onPlay: () => void;
}

export function SegmentCard({
  segment,
  colorIndex,
  isSelected,
  onSelect,
  onPlay,
}: SegmentCardProps) {
  const color = getSpeakerColor(colorIndex);
  const duration = segment.end - segment.start;

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-lg border p-3 transition-all",
        isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "hover:border-muted-foreground/30 hover:bg-muted/30",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Color indicator */}
      <div
        className="absolute top-0 left-0 h-full w-1 rounded-l-lg"
        style={{ backgroundColor: color.border }}
      />

      {/* Time range */}
      <div className="mb-1 pl-2 font-mono text-xs">
        {formatTimeRange(segment.start, segment.end)}
      </div>

      {/* Duration */}
      <div className="mb-2 pl-2 text-muted-foreground text-xs">
        {formatDuration(duration)}
      </div>

      {/* Play button */}
      <Button
        className="h-7 w-full gap-1 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        size="sm"
        variant="secondary"
      >
        <Play className="h-3 w-3" />
        Play
      </Button>
    </div>
  );
}

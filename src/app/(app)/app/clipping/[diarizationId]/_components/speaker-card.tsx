"use client";

import { getSpeakerColor } from "~/lib/speaker-colors";
import { formatDuration } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import type { SpeakerMetadata } from "../_hooks/use-workspace-state";

interface SpeakerCardProps {
  speaker: SpeakerMetadata;
  isSelected: boolean;
  onSelect: () => void;
}

export function SpeakerCard({
  speaker,
  isSelected,
  onSelect,
}: SpeakerCardProps) {
  const color = getSpeakerColor(speaker.colorIndex);

  return (
    <button
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-transparent hover:bg-muted/50",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2">
        <div
          className={cn("h-3 w-3 shrink-0 rounded-full", color.bgClass)}
          style={{ backgroundColor: color.border }}
        />
        <span className="truncate font-medium text-sm">{speaker.label}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground text-xs">
        <div>
          <span className="text-foreground">{speaker.segmentCount}</span>{" "}
          segments
        </div>
        <div>
          <span className="text-foreground">
            {formatDuration(speaker.totalDuration)}
          </span>
        </div>
      </div>

      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${speaker.percentage}%`,
              backgroundColor: color.border,
            }}
          />
        </div>
        <div className="mt-1 text-muted-foreground text-xs">
          {speaker.percentage.toFixed(1)}% of audio
        </div>
      </div>
    </button>
  );
}

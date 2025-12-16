"use client";

import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { SpeakerCollections } from "../../_store/clipping-workspace-store";
import { getSpeakerDisplayName } from "../../_utils/segment-utils";

interface Segment {
  id: string;
  speaker: string;
  start: number;
  end: number;
}

interface TimelineSegmentsBarProps {
  segments: Segment[];
  selectedSegmentId: string | null;
  selectedSpeaker: string | null;
  speakerCollections: SpeakerCollections;
  timeToPixels: (time: number) => number;
  onSegmentClick: (segmentId: string) => void;
  getSpeakerColorIndex: (speaker: string) => number;
}

export function TimelineSegmentsBar({
  segments,
  selectedSegmentId,
  selectedSpeaker,
  speakerCollections,
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
        // Dim segments that don't belong to the selected speaker
        const isDimmed =
          selectedSpeaker !== null && segment.speaker !== selectedSpeaker;

        return (
          <button
            className={cn(
              "absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
              isSelected
                ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "hover:brightness-110",
              isDimmed && "opacity-25 grayscale",
            )}
            key={segment.id}
            onClick={() => onSegmentClick(segment.id)}
            style={{
              left,
              width: Math.max(width, 4),
              backgroundColor: isDimmed ? "rgba(100, 100, 100, 0.3)" : color.bg,
              borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color.border,
            }}
            type="button"
          >
            {width > 50 && (
              <span
                className="block truncate px-1 font-mono text-[10px] leading-6"
                style={{
                  color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color.border,
                }}
              >
                {getSpeakerDisplayName(segment.speaker, speakerCollections)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

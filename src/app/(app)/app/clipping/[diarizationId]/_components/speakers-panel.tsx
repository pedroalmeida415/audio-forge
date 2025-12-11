"use client";

import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { useClippingWorkspaceStore } from "../_store/clipping-workspace-provider";
import type { SpeakerMetadata } from "../_store/clipping-workspace-store";
import { SpeakerCard } from "./speaker-card";

/**
 * Derives speaker metadata from segments.
 */
function computeSpeakers(
  segments: { speaker: string; start: number; end: number }[],
  duration: number,
): SpeakerMetadata[] {
  // Get unique speakers in order of first appearance
  const seen = new Set<string>();
  const speakerOrder: string[] = [];
  for (const segment of segments) {
    if (!seen.has(segment.speaker)) {
      seen.add(segment.speaker);
      speakerOrder.push(segment.speaker);
    }
  }

  // Calculate speaker metadata
  const speakerMap = new Map<
    string,
    { segmentCount: number; totalDuration: number }
  >();

  for (const segment of segments) {
    const existing = speakerMap.get(segment.speaker) ?? {
      segmentCount: 0,
      totalDuration: 0,
    };
    speakerMap.set(segment.speaker, {
      segmentCount: existing.segmentCount + 1,
      totalDuration: existing.totalDuration + (segment.end - segment.start),
    });
  }

  return speakerOrder.map((speaker, index) => {
    const data = speakerMap.get(speaker) ?? {
      segmentCount: 0,
      totalDuration: 0,
    };
    return {
      id: speaker,
      label: speaker,
      segmentCount: data.segmentCount,
      totalDuration: data.totalDuration,
      percentage: duration > 0 ? (data.totalDuration / duration) * 100 : 0,
      colorIndex: index,
    };
  });
}

export function SpeakersPanel() {
  const segmentsById = useClippingWorkspaceStore((s) => s.segmentsById);
  const duration = useClippingWorkspaceStore((s) => s.duration);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);
  const selectSpeaker = useClippingWorkspaceStore((s) => s.selectSpeaker);

  const speakers = useMemo(
    () => computeSpeakers(Object.values(segmentsById), duration),
    [segmentsById, duration],
  );

  return (
    <div className="w-64 shrink-0 overflow-y-auto border-r bg-muted/20">
      <div className="p-4">
        <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wider">
          Speakers
        </h2>

        <div className="space-y-2">
          {/* All speakers option */}
          <button
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              selectedSpeaker === null
                ? "border-primary bg-primary/10"
                : "border-transparent hover:bg-muted/50",
            )}
            onClick={() => selectSpeaker(null)}
            type="button"
          >
            <div className="font-medium text-sm">All Speakers</div>
            <div className="text-muted-foreground text-xs">
              {speakers.reduce((sum, s) => sum + s.segmentCount, 0)} segments
            </div>
          </button>

          {/* Individual speakers */}
          {speakers.map((speaker) => (
            <SpeakerCard
              isSelected={selectedSpeaker === speaker.id}
              key={speaker.id}
              onSelect={() => selectSpeaker(speaker.id)}
              speaker={speaker}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

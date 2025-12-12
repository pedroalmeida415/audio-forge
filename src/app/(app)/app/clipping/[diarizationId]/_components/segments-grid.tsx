"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlaybackContext } from "../_context/playback.context";
import { useClippingWorkspaceStore } from "../_context/store.context";
import { SegmentCard } from "./segment-card";

/**
 * Get speaker color index from speaker order.
 */
function getSpeakerColorIndex(
  segments: { speaker: string }[],
  speaker: string,
): number {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const seg of segments) {
    if (!seen.has(seg.speaker)) {
      seen.add(seg.speaker);
      order.push(seg.speaker);
    }
  }
  const index = order.indexOf(speaker);
  return index >= 0 ? index : 0;
}

export function SegmentsGrid() {
  const { handleSegmentPlay, handleSegmentSelect } = usePlaybackContext();
  const segmentsById = useClippingWorkspaceStore((s) => s.segmentsById);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);
  const selectedSegmentId = useClippingWorkspaceStore(
    (s) => s.selectedSegmentId,
  );

  // Derive filtered segments
  const filteredSegments = useMemo(() => {
    const segments = Object.values(segmentsById);
    return selectedSpeaker
      ? segments.filter((s) => s.speaker === selectedSpeaker)
      : segments;
  }, [segmentsById, selectedSpeaker]);

  const gridRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected segment
  useEffect(() => {
    if (selectedSegmentId && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedSegmentId]);

  if (filteredSegments.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">No segments for this speaker</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-4" ref={gridRef}>
      <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wider">
        Segments
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filteredSegments.map((segment) => (
          <div
            key={segment.id}
            ref={segment.id === selectedSegmentId ? selectedRef : undefined}
          >
            <SegmentCard
              colorIndex={getSpeakerColorIndex(
                Object.values(segmentsById),
                segment.speaker,
              )}
              isSelected={segment.id === selectedSegmentId}
              onPlay={() => handleSegmentPlay(segment.id)}
              onSelect={() => handleSegmentSelect(segment.id)}
              segment={segment}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

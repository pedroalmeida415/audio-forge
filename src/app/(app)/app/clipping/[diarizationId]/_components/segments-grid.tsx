"use client";

import { useEffect, useRef } from "react";
import { useClippingWorkspace } from "../_context/clipping-workspace-context";
import { SegmentCard } from "./segment-card";

export function SegmentsGrid() {
  const { workspace, handleSegmentSelect, handleSegmentPlay } =
    useClippingWorkspace();
  const { filteredSegments, selectedSegmentId, getSpeakerColorIndex } =
    workspace;

  const gridRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected segment
  useEffect(() => {
    if (selectedSegmentId && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
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
              colorIndex={getSpeakerColorIndex(segment.speaker)}
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

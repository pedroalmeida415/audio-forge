"use client";

import { useValue } from "@legendapp/state/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useSpeakersStore } from "~/features/speakers/context/speakers.context";
import { PlayingIndicator } from "./playing-indicator";
import { SegmentRow } from "./segment-row";

const ROW_HEIGHT = 56; // Height in pixels
const OVERSCAN = 5; // Number of extra rows to render above/below viewport

export function SpeakersPage() {
  const $store = useSpeakersStore();
  const segments = useValue($store.segments);
  const speaker = useValue($store.speaker);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (!speaker) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Speaker not found</p>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <SpeakerHeader speaker={speaker} segmentCount={0} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No segments for this speaker</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SpeakerHeader speaker={speaker} segmentCount={segments.length} />
      <PlayingIndicator />

      {/* Virtualized segment list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const segment = segments[virtualRow.index];
            if (!segment) return null;

            return (
              <SegmentRow
                key={virtualRow.key}
                segment={segment}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SpeakerHeaderProps {
  speaker: {
    id: string;
    name: string;
    color: string | null;
    projectName: string;
  };
  segmentCount: number;
}

function SpeakerHeader({ speaker, segmentCount }: SpeakerHeaderProps) {
  return (
    <div className="flex items-center gap-4 border-border border-b px-4 py-3">
      {/* Speaker color indicator */}
      {speaker.color && (
        <div
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: speaker.color }}
        />
      )}

      {/* Speaker name */}
      <div className="flex flex-col">
        <h1 className="font-semibold text-lg">{speaker.name}</h1>
        <p className="text-muted-foreground text-sm">
          {speaker.projectName} &middot; {segmentCount.toLocaleString()} segment
          {segmentCount !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

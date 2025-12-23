"use client";

import type { Observable } from "@legendapp/state";
import { For, Memo, useValue } from "@legendapp/state/react";
import { $React } from "@legendapp/state/react-web";
import { withAlpha } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";

// ============================================================================
// Timeline Segment Component (uses reactive props for fine-grained updates)
// ============================================================================

interface TimelineSegmentProps {
  item$: Observable<DiarizationSegment>;
}

function TimelineSegment({ item$: $segment }: TimelineSegmentProps) {
  const $store = useClippingStore();

  // Only subscribe to stable values needed for identity and filtering
  const { id, speaker, isDeleted } = useValue($segment);

  if (isDeleted) return null;

  return (
    <$React.button
      type="button"
      onClick={() => $store.setActiveSegment(id)}
      $className={() => {
        const isActive = id === $store.activeSegmentId.get();
        const isDimmed =
          $store.selectedSpeaker.get() !== null &&
          speaker !== $store.selectedSpeaker.get();
        return cn(
          "absolute top-1 h-6 overflow-hidden rounded border text-left transition-[opacity,filter]",
          isActive
            ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
            : "hover:brightness-110",
          isDimmed && "opacity-25 grayscale",
        );
      }}
      $style={() => {
        const pps = $store.timeline.getPixelsPerSecond.get();
        const start = $segment.start.get();
        const end = $segment.end.get();
        const color = $store.speakerColors[speaker]?.get();
        const isDimmed =
          $store.selectedSpeaker.get() !== null &&
          speaker !== $store.selectedSpeaker.get();

        return {
          left: start * pps,
          width: Math.max((end - start) * pps, 4),
          backgroundColor: isDimmed
            ? "rgba(100, 100, 100, 0.3)"
            : color && withAlpha(color, 0.4),
          borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color,
        };
      }}
    >
      {/* Segment label - only shows when width > 50px */}
      <Memo>
        {() => {
          const pps = $store.timeline.getPixelsPerSecond.get();
          const start = $segment.start.get();
          const end = $segment.end.get();
          const width = (end - start) * pps;

          if (width <= 50) return null;

          const isDimmed =
            $store.selectedSpeaker.get() !== null &&
            speaker !== $store.selectedSpeaker.get();
          const color = $store.speakerColors[speaker]?.get();
          const speakerCollection = $store.speakerCollections[speaker]?.get();

          return (
            <span
              className="block truncate px-2 font-mono text-[10px] leading-6"
              style={{
                color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color,
              }}
            >
              {speakerCollection?.collectionName ?? speaker}
            </span>
          );
        }}
      </Memo>
    </$React.button>
  );
}

// ============================================================================
// Timeline Segments Bar (orchestrates segment rendering)
// ============================================================================

export function TimelineSegmentsBar() {
  const $store = useClippingStore();

  return (
    <div className="relative h-8 shrink-0">
      <For each={$store.segments} item={TimelineSegment} optimized />
    </div>
  );
}

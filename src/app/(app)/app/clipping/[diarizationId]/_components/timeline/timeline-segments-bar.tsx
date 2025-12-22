"use client";

import type { Observable } from "@legendapp/state";
import { For, useValue } from "@legendapp/state/react";
import { withAlpha } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

// ============================================================================
// Timeline Segment Component (subscribes to individual segment)
// ============================================================================

interface TimelineSegmentProps {
  item$: Observable<DiarizationSegment>;
}

function TimelineSegment({ item$: $segment }: TimelineSegmentProps) {
  const $store = useClippingStore();

  const { id, end, speaker, start, isDeleted } = useValue($segment);

  // Subscribe to timeline state for pixel calculations
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  // Subscribe to selection state
  const isActive = useValue(() => id === $store.activeSegmentId.get());
  const isDimmed = useValue(
    () =>
      $store.selectedSpeaker.get() !== null &&
      speaker !== $store.selectedSpeaker.get(),
  );

  // Subscribe to this speaker's collection mapping directly for reactivity
  const speakerCollection = useValue($store.speakerCollections[speaker]);

  // Subscribe to speaker colors from store
  const speakerColors = useValue($store.speakerColors);

  // Compute pixelsPerSecond
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

  // Derived values
  const left = start * pixelsPerSecond;
  const width = (end - start) * pixelsPerSecond;

  const color = speakerColors[speaker];

  if (isDeleted) return null;

  return (
    <button
      className={cn(
        "absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
        isActive
          ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "hover:brightness-110",
        isDimmed && "opacity-25 grayscale",
      )}
      onClick={() => $store.setActiveSegment(id)}
      style={{
        left,
        width: Math.max(width, 4),
        backgroundColor: isDimmed
          ? "rgba(100, 100, 100, 0.3)"
          : color && withAlpha(color, 0.4),
        borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color,
      }}
      type="button"
    >
      {/* Segment label */}
      {width > 50 && (
        <span
          className="block truncate px-2 font-mono text-[10px] leading-6"
          style={{
            color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color,
          }}
        >
          {speakerCollection?.collectionName ?? speaker}
        </span>
      )}
    </button>
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

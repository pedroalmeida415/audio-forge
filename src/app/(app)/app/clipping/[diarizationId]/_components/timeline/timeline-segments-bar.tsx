"use client";

import type { Observable } from "@legendapp/state";
import { For, useValue } from "@legendapp/state/react";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-store";
import { getSpeakerDisplayName } from "../../_utils/segment-utils";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

// ============================================================================
// Timeline Segment Component (subscribes to individual segment)
// ============================================================================

interface TimelineSegmentProps {
  item$: Observable<DiarizationSegment>;
}

function TimelineSegment({ item$: $segment }: TimelineSegmentProps) {
  const $store = useClippingStore();
  const { handleTimelineSegmentClick } = usePlayback();

  // Subscribe to timeline state for pixel calculations
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  // Compute pixelsPerSecond
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

  // Subscribe to individual segment fields
  const id = useValue($segment.id);
  const speaker = useValue($segment.speaker);
  const start = useValue($segment.start);
  const end = useValue($segment.end);

  // Subscribe to selection state
  const activeSegmentId = useValue($store.selection.activeSegmentId);
  const selectedSpeaker = useValue($store.selection.selectedSpeaker);

  // Subscribe to speaker collections for display name
  const speakerCollections = useValue($store.speakerCollections);

  // Derived values
  const left = start * pixelsPerSecond;
  const width = (end - start) * pixelsPerSecond;
  const isActive = id === activeSegmentId;
  const isDimmed = selectedSpeaker !== null && speaker !== selectedSpeaker;

  // TODO improve speaker color mapping
  const color = {
    bg: "",
    border: "",
  };

  return (
    <button
      className={cn(
        "absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
        isActive
          ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "hover:brightness-110",
        isDimmed && "opacity-25 grayscale",
      )}
      onClick={() => handleTimelineSegmentClick(id)}
      style={{
        left,
        width: Math.max(width, 4),
        backgroundColor: isDimmed ? "rgba(100, 100, 100, 0.3)" : color.bg,
        borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color.border,
      }}
      type="button"
    >
      {/* Segment label */}
      {width > 50 && (
        <span
          className="block truncate px-2 font-mono text-[10px] leading-6"
          style={{
            color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color.border,
          }}
        >
          {getSpeakerDisplayName(speaker, speakerCollections)}
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

"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { useEffect, useMemo, useRef } from "react";
import { withAlpha } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";

const OVERSCAN_TIME = 20; // seconds of overscan

/**
 * Segments bar with direct DOM manipulation.
 *
 * Uses transform: translateX for GPU-accelerated positioning.
 * Updates segment positions directly via refs when scroll/zoom changes.
 */
export function TimelineSegmentsBar() {
  const $store = useClippingStore();
  const segmentRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Subscribe to segments (only re-renders when segments change)
  const segments = useSelector(() => $store.segments.get());

  // Filter to non-deleted segments
  const visibleSegments = useMemo(
    () => segments.filter((s) => !s.isDeleted),
    [segments],
  );

  // Direct DOM manipulation for scroll/zoom
  useEffect(() => {
    if (visibleSegments.length === 0) return;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerWidth = $store.timeline.containerWidth.get();

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps - OVERSCAN_TIME;
      const visibleEndTime = (scrollOffset + containerWidth) / pps + OVERSCAN_TIME;

      segmentRefsMap.current.forEach((el, segmentId) => {
        const segment = visibleSegments.find((s) => s.id === segmentId);
        if (!segment) return;

        const { start, end } = segment;

        // Check if segment is visible
        const isVisible = end >= visibleStartTime && start <= visibleEndTime;

        if (!isVisible) {
          el.style.display = "none";
          return;
        }

        // Calculate position and size
        const x = start * pps - scrollOffset;
        const width = Math.max((end - start) * pps, 4);

        // Update element
        el.style.display = "block";
        el.style.transform = `translateX(${x}px)`;
        el.style.width = `${width}px`;
      });
    });

    return dispose;
  }, [visibleSegments, $store]);

  if (visibleSegments.length === 0) return null;

  return (
    <div className="relative h-8 shrink-0 overflow-hidden">
      {visibleSegments.map((segment) => (
        <TimelineSegment
          key={segment.id}
          segment={segment}
          segmentRefsMap={segmentRefsMap}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Timeline Segment Component
// ============================================================================

interface TimelineSegmentProps {
  segment: DiarizationSegment;
  segmentRefsMap: React.RefObject<Map<string, HTMLButtonElement>>;
}

function TimelineSegment({
  segment,
  segmentRefsMap,
}: TimelineSegmentProps) {
  const $store = useClippingStore();
  const { id, speaker } = segment;

  // Get static values that don't change on scroll/zoom
  const color = useSelector(() => $store.speakerColors[speaker]?.get());
  const collectionName = useSelector(
    () => $store.speakerCollections[speaker]?.collectionName.get() ?? speaker,
  );

  // Subscribe to active/dimmed state
  const isActive = useSelector(() => id === $store.activeSegmentId.get());
  const isDimmed = useSelector(() => {
    const selectedSpeaker = $store.selectedSpeaker.get();
    return selectedSpeaker !== null && speaker !== selectedSpeaker;
  });

  return (
    <button
      type="button"
      ref={(el) => {
        if (el) {
          segmentRefsMap.current?.set(id, el);
        } else {
          segmentRefsMap.current?.delete(id);
        }
      }}
      onClick={() => $store.setActiveSegment(id)}
      className={cn(
        "absolute left-0 top-1 h-6 overflow-hidden rounded border text-left transition-[opacity,filter]",
        isActive
          ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "hover:brightness-110",
        isDimmed && "opacity-25 grayscale",
      )}
      style={{
        willChange: "transform, width",
        backgroundColor: isDimmed
          ? "rgba(100, 100, 100, 0.3)"
          : color && withAlpha(color, 0.4),
        borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color,
      }}
    >
      <span
        className="block truncate px-2 font-mono text-[10px] leading-6"
        style={{
          color: isDimmed ? "rgba(150, 150, 150, 0.7)" : color,
        }}
      >
        {collectionName}
      </span>
    </button>
  );
}

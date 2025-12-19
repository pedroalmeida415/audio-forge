"use client";

import type { Observable } from "@legendapp/state";
import { useSelector, useValue } from "@legendapp/state/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { api } from "~/trpc/react";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-store";
import { getSpeakerDisplayName } from "../../_utils/segment-utils";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

// Minimum segment duration in seconds
const MIN_SEGMENT_DURATION = 0.1;

// ============================================================================
// Timeline Segment Component (subscribes to individual segment)
// ============================================================================

interface TimelineSegmentProps {
  $segment: Observable<DiarizationSegment>;
  speakerOrder: string[];
  pixelsPerSecond: number;
}

function TimelineSegment({
  $segment,
  speakerOrder,
  pixelsPerSecond,
}: TimelineSegmentProps) {
  const $store = useClippingStore();
  const { handleTimelineSegmentClick } = usePlayback();
  const diarizationId = useValue($store.diarizationId);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

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

  // Local drag state
  const [dragState, setDragState] = useState<{
    field: "start" | "end";
    initialTime: number;
    initialMouseX: number;
    currentTime: number;
  } | null>(null);

  const wasDragging = useRef(false);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Refs for callbacks to avoid stale closures
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  pixelsPerSecondRef.current = pixelsPerSecond;

  // Derived values
  const colorIndex = speakerOrder.indexOf(speaker);
  const color = getSpeakerColor(colorIndex >= 0 ? colorIndex : 0);
  const left = start * pixelsPerSecond;
  const width = (end - start) * pixelsPerSecond;
  const isActive = id === activeSegmentId;
  const isDimmed = selectedSpeaker !== null && speaker !== selectedSpeaker;
  const isDragging = dragState !== null;

  const pixelsToTime = useCallback((pixels: number) => {
    const pps = pixelsPerSecondRef.current;
    return pps > 0 ? pixels / pps : 0;
  }, []);

  const handleDragStart = useCallback(
    (e: React.MouseEvent, field: "start" | "end", initialTime: number) => {
      e.stopPropagation();
      e.preventDefault();

      const newDragState = {
        field,
        initialTime,
        initialMouseX: e.clientX,
        currentTime: initialTime,
      };
      setDragState(newDragState);
      dragStateRef.current = newDragState;

      const moveHandler = (ev: MouseEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        wasDragging.current = true;
        const deltaX = ev.clientX - state.initialMouseX;
        const deltaTime = pixelsToTime(deltaX);
        let newTime = state.initialTime + deltaTime;

        // Get current segment times from the observable
        const currentStart = $segment.start.peek();
        const currentEnd = $segment.end.peek();

        let newStart = currentStart;
        let newEnd = currentEnd;

        if (state.field === "start") {
          newTime = Math.max(
            0,
            Math.min(newTime, currentEnd - MIN_SEGMENT_DURATION),
          );
          newStart = newTime;
        } else {
          newTime = Math.max(currentStart + MIN_SEGMENT_DURATION, newTime);
          newEnd = newTime;
        }

        // Update store for visual feedback
        $store.segmentActions.updateTimes(id, newStart, newEnd);
        dragStateRef.current = { ...state, currentTime: newTime };
      };

      const upHandler = () => {
        const state = dragStateRef.current;
        if (state && state.currentTime !== state.initialTime) {
          updateSegmentsMutation.mutate({
            diarizationId,
            segmentIds: id,
            updates: { [state.field]: state.currentTime },
          });
        }

        setDragState(null);
        dragStateRef.current = null;

        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);

        setTimeout(() => {
          wasDragging.current = false;
        }, 10);
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    },
    [
      $segment,
      $store.segmentActions,
      diarizationId,
      id,
      pixelsToTime,
      updateSegmentsMutation,
    ],
  );

  const handleClick = useCallback(() => {
    if (wasDragging.current) return;
    handleTimelineSegmentClick(id);
  }, [handleTimelineSegmentClick, id]);

  return (
    <button
      className={cn(
        "group absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
        isActive
          ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "hover:brightness-110",
        isDimmed && "opacity-25 grayscale",
        isDragging && "z-20",
      )}
      onClick={handleClick}
      style={{
        left,
        width: Math.max(width, 4),
        backgroundColor: isDimmed ? "rgba(100, 100, 100, 0.3)" : color.bg,
        borderColor: isDimmed ? "rgba(100, 100, 100, 0.5)" : color.border,
      }}
      type="button"
    >
      {/* Left drag handle (start time) */}
      <div
        className={cn(
          "absolute top-0 left-0 h-full w-2 cursor-ew-resize",
          "opacity-0 transition-opacity group-hover:opacity-100",
          isDragging && dragState?.field === "start" && "opacity-100",
        )}
        onMouseDown={(e) => handleDragStart(e, "start", start)}
        style={{
          backgroundColor: isDimmed ? "rgba(150, 150, 150, 0.3)" : color.border,
        }}
      />

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

      {/* Right drag handle (end time) */}
      <div
        className={cn(
          "absolute top-0 right-0 h-full w-2 cursor-ew-resize",
          "opacity-0 transition-opacity group-hover:opacity-100",
          isDragging && dragState?.field === "end" && "opacity-100",
        )}
        onMouseDown={(e) => handleDragStart(e, "end", end)}
        style={{
          backgroundColor: isDimmed ? "rgba(150, 150, 150, 0.3)" : color.border,
        }}
      />
    </button>
  );
}

// ============================================================================
// Timeline Segments Bar (orchestrates segment rendering)
// ============================================================================

export function TimelineSegmentsBar() {
  const $store = useClippingStore();

  // Subscribe to timeline state for pixel calculations
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  // Compute pixelsPerSecond
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

  // Subscribe to segments array for rendering, but filter out deleted
  const visibleSegments = useSelector(() =>
    $store.segments.get().filter((s) => !s.isDeleted),
  );

  // Compute speaker order for consistent coloring
  const speakerOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const seg of visibleSegments) {
      if (!seen.has(seg.speaker)) {
        seen.add(seg.speaker);
        order.push(seg.speaker);
      }
    }
    return order;
  }, [visibleSegments]);

  // Get segment observables for individual subscriptions
  const segmentObservables = useSelector(() => {
    const byId = $store.segmentsById();
    return visibleSegments.map((s) => ({ id: s.id, $segment: byId[s.id] }));
  });

  return (
    <div className="relative h-8 shrink-0">
      {segmentObservables.map(
        ({ id, $segment }) =>
          $segment && (
            <TimelineSegment
              key={id}
              $segment={$segment}
              speakerOrder={speakerOrder}
              pixelsPerSecond={pixelsPerSecond}
            />
          ),
      )}
    </div>
  );
}

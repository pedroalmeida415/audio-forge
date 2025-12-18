"use client";

import { useCallback, useRef, useState } from "react";
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
  activeSegmentId: string | null;
  selectedSpeaker: string | null;
  speakerCollections: SpeakerCollections;
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
  onSegmentClick: (segmentId: string) => void;
  // Called during drag for optimistic UI update (updates local store)
  onDragUpdate: (segmentId: string, start: number, end: number) => void;
  // Called on drag end to persist changes (triggers mutation)
  onCommitUpdate: (
    segmentId: string,
    field: "start" | "end",
    newTime: number,
  ) => void;
  getSpeakerColorIndex: (speaker: string) => number;
}

// Minimum segment duration in seconds
const MIN_SEGMENT_DURATION = 0.1;

export function TimelineSegmentsBar({
  segments,
  activeSegmentId,
  selectedSpeaker,
  speakerCollections,
  timeToPixels,
  pixelsToTime,
  onSegmentClick,
  onDragUpdate,
  onCommitUpdate,
  getSpeakerColorIndex,
}: TimelineSegmentsBarProps) {
  // Track active drag state
  const [dragState, setDragState] = useState<{
    segmentId: string;
    field: "start" | "end";
    initialTime: number;
    initialMouseX: number;
    currentTime: number; // Track current value for commit
  } | null>(null);

  // Ref to prevent click events from firing after drag
  const wasDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs to store current drag state for event handlers (avoids stale closures)
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Use refs for callbacks to avoid recreating handlers
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const pixelsToTimeRef = useRef(pixelsToTime);
  pixelsToTimeRef.current = pixelsToTime;

  const onDragUpdateRef = useRef(onDragUpdate);
  onDragUpdateRef.current = onDragUpdate;

  const onCommitUpdateRef = useRef(onCommitUpdate);
  onCommitUpdateRef.current = onCommitUpdate;

  // Start drag - initializes state and attaches event listeners
  const handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      segmentId: string,
      field: "start" | "end",
      initialTime: number,
    ) => {
      e.stopPropagation();
      e.preventDefault();

      const newDragState = {
        segmentId,
        field,
        initialTime,
        initialMouseX: e.clientX,
        currentTime: initialTime,
      };
      setDragState(newDragState);
      dragStateRef.current = newDragState;

      // Define handlers that use refs (not closures over state)
      const moveHandler = (ev: MouseEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        wasDragging.current = true;
        const deltaX = ev.clientX - state.initialMouseX;
        const deltaTime =
          pixelsToTimeRef.current(deltaX) - pixelsToTimeRef.current(0);
        let newTime = state.initialTime + deltaTime;

        // Find the segment being dragged
        const segment = segmentsRef.current.find((s) => s.id === state.segmentId);
        if (!segment) return;

        // Clamp to valid range
        let newStart = segment.start;
        let newEnd = segment.end;
        if (state.field === "start") {
          newTime = Math.max(
            0,
            Math.min(newTime, segment.end - MIN_SEGMENT_DURATION),
          );
          newStart = newTime;
        } else {
          newTime = Math.max(segment.start + MIN_SEGMENT_DURATION, newTime);
          newEnd = newTime;
        }

        // Update local store for visual feedback (no mutation yet)
        onDragUpdateRef.current(state.segmentId, newStart, newEnd);

        // Track current time for commit
        dragStateRef.current = { ...state, currentTime: newTime };
      };

      const upHandler = () => {
        const state = dragStateRef.current;
        if (state && state.currentTime !== state.initialTime) {
          // Only commit if value actually changed
          onCommitUpdateRef.current(state.segmentId, state.field, state.currentTime);
        }

        setDragState(null);
        dragStateRef.current = null;

        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);

        // Reset wasDragging after a short delay to allow click prevention
        setTimeout(() => {
          wasDragging.current = false;
        }, 10);
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    },
    [],
  );

  const handleSegmentClick = useCallback(
    (segmentId: string) => {
      // Don't fire click if we were dragging
      if (wasDragging.current) return;
      onSegmentClick(segmentId);
    },
    [onSegmentClick],
  );

  return (
    <div ref={containerRef} className="relative h-8 shrink-0">
      {segments.map((segment) => {
        const colorIndex = getSpeakerColorIndex(segment.speaker);
        const color = getSpeakerColor(colorIndex);
        const left = timeToPixels(segment.start);
        const width = timeToPixels(segment.end) - left;
        const isActive = segment.id === activeSegmentId;
        const isDragging = dragState?.segmentId === segment.id;
        // Dim segments that don't belong to the selected speaker
        const isDimmed =
          selectedSpeaker !== null && segment.speaker !== selectedSpeaker;

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
            key={segment.id}
            onClick={() => handleSegmentClick(segment.id)}
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
              onMouseDown={(e) =>
                handleDragStart(e, segment.id, "start", segment.start)
              }
              style={{
                backgroundColor: isDimmed
                  ? "rgba(150, 150, 150, 0.3)"
                  : color.border,
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
                {getSpeakerDisplayName(segment.speaker, speakerCollections)}
              </span>
            )}

            {/* Right drag handle (end time) */}
            <div
              className={cn(
                "absolute top-0 right-0 h-full w-2 cursor-ew-resize",
                "opacity-0 transition-opacity group-hover:opacity-100",
                isDragging && dragState?.field === "end" && "opacity-100",
              )}
              onMouseDown={(e) =>
                handleDragStart(e, segment.id, "end", segment.end)
              }
              style={{
                backgroundColor: isDimmed
                  ? "rgba(150, 150, 150, 0.3)"
                  : color.border,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

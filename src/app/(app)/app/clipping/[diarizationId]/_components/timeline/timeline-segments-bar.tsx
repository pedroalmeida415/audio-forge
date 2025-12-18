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
  selectedSegmentId: string | null;
  selectedSpeaker: string | null;
  speakerCollections: SpeakerCollections;
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
  onSegmentClick: (segmentId: string) => void;
  onUpdateSegmentTime: (
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
  selectedSegmentId,
  selectedSpeaker,
  speakerCollections,
  timeToPixels,
  pixelsToTime,
  onSegmentClick,
  onUpdateSegmentTime,
  getSpeakerColorIndex,
}: TimelineSegmentsBarProps) {
  // Track active drag state
  const [dragState, setDragState] = useState<{
    segmentId: string;
    field: "start" | "end";
    initialTime: number;
    initialMouseX: number;
  } | null>(null);

  // Ref to prevent click events from firing after drag
  const wasDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      segmentId: string,
      field: "start" | "end",
      initialTime: number,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      setDragState({
        segmentId,
        field,
        initialTime,
        initialMouseX: e.clientX,
      });
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return;

      wasDragging.current = true;
      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTime = pixelsToTime(deltaX) - pixelsToTime(0);
      let newTime = dragState.initialTime + deltaTime;

      // Find the segment being dragged
      const segment = segments.find((s) => s.id === dragState.segmentId);
      if (!segment) return;

      // Clamp to valid range
      if (dragState.field === "start") {
        // Start time: min 0, max end - MIN_SEGMENT_DURATION
        newTime = Math.max(
          0,
          Math.min(newTime, segment.end - MIN_SEGMENT_DURATION),
        );
      } else {
        // End time: min start + MIN_SEGMENT_DURATION
        newTime = Math.max(segment.start + MIN_SEGMENT_DURATION, newTime);
      }

      onUpdateSegmentTime(dragState.segmentId, dragState.field, newTime);
    },
    [dragState, segments, pixelsToTime, onUpdateSegmentTime],
  );

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      setDragState(null);
      // Reset wasDragging after a short delay to allow click prevention
      setTimeout(() => {
        wasDragging.current = false;
      }, 10);
    }
  }, [dragState]);

  // Attach global mouse listeners when dragging
  const handleDragStartWithListeners = useCallback(
    (
      e: React.MouseEvent,
      segmentId: string,
      field: "start" | "end",
      initialTime: number,
    ) => {
      handleDragStart(e, segmentId, field, initialTime);

      const moveHandler = (ev: MouseEvent) => handleMouseMove(ev);
      const upHandler = () => {
        handleMouseUp();
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    },
    [handleDragStart, handleMouseMove, handleMouseUp],
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
        const isSelected = segment.id === selectedSegmentId;
        const isDragging = dragState?.segmentId === segment.id;
        // Dim segments that don't belong to the selected speaker
        const isDimmed =
          selectedSpeaker !== null && segment.speaker !== selectedSpeaker;

        return (
          <button
            className={cn(
              "group absolute top-1 h-6 overflow-hidden rounded border text-left transition-all",
              isSelected
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
                isDragging && dragState.field === "start" && "opacity-100",
              )}
              onMouseDown={(e) =>
                handleDragStartWithListeners(
                  e,
                  segment.id,
                  "start",
                  segment.start,
                )
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
                isDragging && dragState.field === "end" && "opacity-100",
              )}
              onMouseDown={(e) =>
                handleDragStartWithListeners(e, segment.id, "end", segment.end)
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

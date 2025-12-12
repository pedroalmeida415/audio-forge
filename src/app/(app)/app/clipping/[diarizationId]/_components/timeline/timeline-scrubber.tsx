"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-workspace-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

interface TimelineScrubberProps {
  onDrag: (clientX: number, rect: DOMRect) => void;
}

export const TimelineScrubber = memo(function TimelineScrubber({
  onDrag,
}: TimelineScrubberProps) {
  const store = useClippingWorkspaceStore();
  // Subscribe to zoom/container changes via React (infrequent updates)
  const zoomLevel = useClippingWorkspaceStore((s) => s.zoomLevel);
  const containerWidth = useClippingWorkspaceStore((s) => s.containerWidth);

  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Cache pixelsPerSecond in a ref - updated when zoom/width changes
  const pixelsPerSecondRef = useRef(0);
  useEffect(() => {
    const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
    pixelsPerSecondRef.current =
      visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

    // Update position immediately when zoom/width changes
    if (scrubberRef.current) {
      const time = store.getState().currentTime;
      scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }
  }, [zoomLevel, containerWidth, store]);

  // Subscribe to currentTime updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    // Set initial position
    if (scrubberRef.current) {
      const time = store.getState().currentTime;
      scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }

    const unsubscribe = store.subscribe(
      (state) => state.currentTime,
      (time) => {
        if (scrubberRef.current) {
          scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
        }
      },
    );

    return unsubscribe;
  }, [store]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      // Get the scrollable container (parent of the timeline content div)
      const scrollContainer = scrubberRef.current?.parentElement?.parentElement;
      if (!scrollContainer) return;

      const rect = scrollContainer.getBoundingClientRect();
      onDrag(e.clientX, rect);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        onDrag(moveEvent.clientX, rect);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [onDrag],
  );

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-20 will-change-transform"
      ref={scrubberRef}
    >
      {/* Vertical line */}
      <div className="absolute inset-y-0 left-0 w-0.5 bg-primary shadow-primary/50 shadow-sm" />

      {/* Draggable handle at top */}
      <div
        className="-left-2.5 pointer-events-auto absolute top-0 flex h-5 w-5 cursor-ew-resize items-center justify-center"
        onPointerDown={handlePointerDown}
      >
        <div
          className={`h-4 w-4 rounded-full border-2 border-primary bg-background shadow-md transition-transform ${
            isDragging ? "scale-110 bg-primary" : "hover:scale-105"
          }`}
        />
      </div>

      {/* Triangle indicator */}
      <div
        className="-left-1.5 absolute top-5 h-0 w-0"
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid hsl(var(--primary))",
        }}
      />
    </div>
  );
});

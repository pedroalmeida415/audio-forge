"use client";

import { memo, useCallback, useEffect, useRef } from "react";
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

      // Get the scrollable container (parent of the timeline content div)
      const scrollContainer = scrubberRef.current?.parentElement?.parentElement;
      if (!scrollContainer) return;

      const rect = scrollContainer.getBoundingClientRect();
      onDrag(e.clientX, rect);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        onDrag(moveEvent.clientX, rect);
      };

      const handlePointerUp = () => {
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
      className="absolute inset-y-0 left-0 z-20 cursor-ew-resize will-change-transform"
      ref={scrubberRef}
      onPointerDown={handlePointerDown}
    >
      {/* Vertical line */}
      <div className="-translate-x-px absolute inset-y-0 left-0 w-0.5 bg-primary" />

      {/* Triangle indicator */}
      <svg
        className="-top-0.5 -left-1.5 absolute w-3 fill-primary"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 9 12"
      >
        <title>Playhead</title>
        <path d="M8 1v5L4.5 10 1 6V1h7z" fillRule="nonzero"></path>
      </svg>
    </div>
  );
});

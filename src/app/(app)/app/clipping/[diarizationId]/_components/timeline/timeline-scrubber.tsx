"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef } from "react";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

export function TimelineScrubber() {
  const $store = useClippingStore();
  const { seek, refs } = $store.playback.peek();
  const { scrollContainerRef } = refs;

  // Subscribe to zoom/container changes via React (infrequent updates)
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  const scrubberRef = useRef<HTMLDivElement>(null);

  // Cache pixelsPerSecond in a ref - updated when zoom/width changes
  const pixelsPerSecondRef = useRef(0);
  useEffect(() => {
    const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
    pixelsPerSecondRef.current =
      visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

    // Update position immediately when zoom/width changes
    if (scrubberRef.current) {
      const time = $store.playback.currentTime.peek();
      scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }
  }, [zoomLevel, containerWidth, $store]);

  // Subscribe to currentTime updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    // Set initial position
    if (scrubberRef.current) {
      const time = $store.playback.currentTime.peek();
      scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }

    // observe() replaces store.subscribe()
    const dispose = observe(() => {
      const time = $store.playback.currentTime.get();
      if (scrubberRef.current) {
        scrubberRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
      }
    });

    return dispose;
  }, [$store]);

  // Convert pixel position to time and seek
  const pixelsToTime = useCallback((pixels: number) => {
    const pps = pixelsPerSecondRef.current;
    return pps > 0 ? pixels / pps : 0;
  }, []);

  const handleDrag = useCallback(
    (clientX: number, rect: DOMRect) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollLeft = container.scrollLeft;
      const relativeX = clientX - rect.left + scrollLeft;
      const time = pixelsToTime(relativeX);
      const duration = $store.playback.duration.peek();
      const clampedTime = Math.max(0, Math.min(time, duration));
      seek(clampedTime);
    },
    [$store.playback.duration, pixelsToTime, seek],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      handleDrag(e.clientX, rect);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        handleDrag(moveEvent.clientX, rect);
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [handleDrag],
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
}

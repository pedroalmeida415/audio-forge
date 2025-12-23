"use client";

import { observe } from "@legendapp/state";
import { useCallback, useEffect, useRef } from "react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Timeline scrubber (playhead) component using Legend-State's observe() pattern.
 *
 * Uses observe() for direct DOM manipulation of the playhead position,
 * bypassing React for high-frequency currentTime updates.
 */
export function TimelineScrubber() {
  const $store = useClippingStore();
  const { seek, refs } = $store.playback.peek();
  const { scrollContainerRef } = refs;

  const scrubberRef = useRef<HTMLDivElement>(null);

  // Subscribe to currentTime and zoom changes for direct DOM updates
  useEffect(() => {
    const dispose = observe(() => {
      const time = $store.playback.currentTime.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      if (scrubberRef.current) {
        scrubberRef.current.style.transform = `translateX(${time * pps}px)`;
      }
    });
    return dispose;
  }, [$store]);

  // Convert pixel position to time and seek
  const pixelsToTime = useCallback(
    (pixels: number) => {
      const pps = $store.timeline.getPixelsPerSecond.get();
      return pps > 0 ? pixels / pps : 0;
    },
    [$store],
  );

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
    [$store.playback.duration, pixelsToTime, seek, scrollContainerRef],
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
    [handleDrag, scrollContainerRef],
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

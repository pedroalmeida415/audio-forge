"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TimelineScrubberProps {
  currentTime: number;
  timeToPixels: (time: number) => number;
  onDrag: (clientX: number, rect: DOMRect) => void;
}

export function TimelineScrubber({
  currentTime,
  timeToPixels,
  onDrag,
}: TimelineScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Use direct DOM manipulation for smooth playhead movement
  useEffect(() => {
    if (scrubberRef.current) {
      scrubberRef.current.style.transform = `translateX(${timeToPixels(currentTime)}px)`;
    }
  }, [currentTime, timeToPixels]);

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
      <div className="absolute inset-y-0 left-0 w-0.5 bg-primary shadow-sm shadow-primary/50" />

      {/* Draggable handle at top */}
      <div
        className="pointer-events-auto absolute -left-2.5 top-0 flex h-5 w-5 cursor-ew-resize items-center justify-center"
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
        className="absolute -left-1.5 top-5 h-0 w-0"
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid hsl(var(--primary))",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";

type PlayheadProps = {
  currentTimeRef: React.RefObject<number>;
  pxPerSec: number;
  height: number;
  isPlaying?: boolean;
  isFocused?: boolean;
};

export function Playhead({
  currentTimeRef,
  pxPerSec,
  height,
  isPlaying = false,
  isFocused = true,
}: PlayheadProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  // Animate playhead position via RAF for smooth rendering at native refresh rate
  useEffect(() => {
    let animationId: number;

    const updatePosition = () => {
      if (elementRef.current && currentTimeRef.current !== undefined) {
        const x = currentTimeRef.current * pxPerSec;
        elementRef.current.style.transform = `translateX(${x}px) translateX(-50%)`;
      }
      animationId = requestAnimationFrame(updatePosition);
    };

    animationId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(animationId);
  }, [currentTimeRef, pxPerSec]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-20 transition-colors",
        !isFocused && "opacity-50"
      )}
      ref={elementRef}
      style={{
        height,
        willChange: "transform",
      }}
    >
      {/* Playhead line */}
      <div
        className={cn("h-full w-0.5", isPlaying ? "bg-red-500" : "bg-primary")}
      />

      {/* Playhead indicator (triangle at top) */}
      <svg
        aria-hidden="true"
        className={cn(
          "-top-0.5 -translate-x-1/2 absolute left-1/2",
          isPlaying ? "text-red-500" : "text-primary"
        )}
        fill="currentColor"
        height="12"
        viewBox="0 0 9 12"
        width="9"
      >
        <path d="M8 1v5L4.5 10 1 6V1h7z" fillRule="nonzero" />
      </svg>
    </div>
  );
}

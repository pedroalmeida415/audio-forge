"use client";

import { cn } from "~/lib/utils";

type PlayheadProps = {
  x: number;
  height: number;
  isPlaying?: boolean;
  isFocused?: boolean;
};

export function Playhead({
  x,
  height,
  isPlaying = false,
  isFocused = true,
}: PlayheadProps) {
  return (
    <div
      className={cn(
        "absolute top-0 pointer-events-none z-20 transition-colors",
        !isFocused && "opacity-50"
      )}
      style={{
        left: x,
        height,
        transform: "translateX(-50%)",
      }}
    >
      {/* Playhead line */}
      <div
        className={cn(
          "w-0.5 h-full",
          isPlaying ? "bg-red-500" : "bg-primary"
        )}
      />

      {/* Playhead indicator (triangle at top) */}
      <svg
        className={cn(
          "absolute -top-0.5 left-1/2 -translate-x-1/2",
          isPlaying ? "text-red-500" : "text-primary"
        )}
        width="9"
        height="12"
        viewBox="0 0 9 12"
        fill="currentColor"
      >
        <path d="M8 1v5L4.5 10 1 6V1h7z" fillRule="nonzero" />
      </svg>
    </div>
  );
}

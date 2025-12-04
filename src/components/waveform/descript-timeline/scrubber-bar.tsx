"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

type ScrubberBarProps = {
  currentTimeRef: React.RefObject<number>;
  duration: number;
  disabled?: boolean;
  onSeek: (time: number) => void;
};

export function ScrubberBar({
  currentTimeRef,
  duration,
  disabled = false,
  onSeek,
}: ScrubberBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  // Animate progress bar via RAF for smooth updates without React re-renders
  useEffect(() => {
    let animationId: number;

    const updateProgress = () => {
      if (progressRef.current && handleRef.current && duration > 0) {
        const currentTime = currentTimeRef.current ?? 0;
        const progress = (currentTime / duration) * 100;
        progressRef.current.style.width = `${progress}%`;
        handleRef.current.style.left = `${progress}%`;
      }
      animationId = requestAnimationFrame(updateProgress);
    };

    animationId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animationId);
  }, [currentTimeRef, duration]);

  // For aria attributes, we read from ref (updated on interaction)
  const currentTime = currentTimeRef.current ?? 0;

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): number => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      return (x / rect.width) * duration;
    },
    [duration]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || duration <= 0) return;
      e.preventDefault();
      setIsDragging(true);
      onSeek(getTimeFromEvent(e));

      const handleMouseMove = (moveEvent: MouseEvent) => {
        onSeek(getTimeFromEvent(moveEvent));
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, duration, getTimeFromEvent, onSeek]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || duration <= 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      setHoverPercent((x / rect.width) * 100);
    },
    [duration]
  );

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  }, [isDragging]);

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label="Seek slider"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      aria-valuetext={`${Math.floor(currentTime)} seconds of ${Math.floor(duration)} seconds`}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "relative h-3 w-full cursor-pointer group",
        disabled && "cursor-default opacity-50"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Track background */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-muted rounded-full overflow-hidden">
        {/* Progress fill - position updated via RAF */}
        <div
          ref={progressRef}
          className="absolute top-0 left-0 h-full bg-primary"
          style={{ willChange: "width" }}
        />

        {/* Hover indicator */}
        {hoverPercent !== null && (
          <div
            className="absolute top-0 left-0 h-full bg-primary/30"
            style={{ width: `${hoverPercent}%` }}
          />
        )}
      </div>

      {/* Handle - position updated via RAF */}
      <span
        ref={handleRef}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
          "h-3 w-3 rounded-full bg-primary",
          "shadow-sm transition-transform",
          "group-hover:scale-125",
          isDragging && "scale-125"
        )}
        style={{ willChange: "left" }}
      />
    </div>
  );
}

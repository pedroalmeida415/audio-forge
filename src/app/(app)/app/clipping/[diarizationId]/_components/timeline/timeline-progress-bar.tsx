"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useClippingWorkspace } from "../../_context/clipping-workspace-context";

export const TimelineProgressBar = memo(function TimelineProgressBar() {
  const { audioPlayer } = useClippingWorkspace();
  const { subscribeToTime, getTime, duration, seek } = audioPlayer;

  const progressRef = useRef<HTMLDivElement>(null);
  const filledRef = useRef<HTMLDivElement>(null);

  // Subscribe to time updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    if (!duration || duration <= 0) return;

    // Set initial position
    if (filledRef.current) {
      const percentage = (getTime() / duration) * 100;
      filledRef.current.style.width = `${percentage}%`;
    }

    const unsubscribe = subscribeToTime((time) => {
      if (filledRef.current) {
        const percentage = (time / duration) * 100;
        filledRef.current.style.width = `${percentage}%`;
      }
    });

    return unsubscribe;
  }, [subscribeToTime, duration, getTime]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || duration <= 0) return;

      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;

      seek(Math.max(0, Math.min(newTime, duration)));
    },
    [duration, seek],
  );

  const handleDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!progressRef.current || duration <= 0) return;

      e.preventDefault();
      const rect = progressRef.current.getBoundingClientRect();

      const updatePosition = (clientX: number) => {
        const clickX = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = percentage * duration;
        seek(newTime);
      };

      updatePosition(e.clientX);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updatePosition(moveEvent.clientX);
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [duration, seek],
  );

  return (
    <div
      aria-label="Audio progress"
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={getTime()}
      className="h-2 w-full cursor-pointer bg-muted"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") seek(Math.max(0, getTime() - 5));
        if (e.key === "ArrowRight") seek(Math.min(duration, getTime() + 5));
      }}
      onPointerDown={handleDrag}
      ref={progressRef}
      role="slider"
      tabIndex={0}
    >
      <div
        className="h-full bg-primary will-change-[width]"
        ref={filledRef}
      />
    </div>
  );
});

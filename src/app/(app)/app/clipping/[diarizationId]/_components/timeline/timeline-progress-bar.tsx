"use client";

import { useCallback, useEffect, useRef } from "react";
import { useClippingWorkspace } from "../../_context/clipping-workspace-context";

export function TimelineProgressBar() {
  const { audioPlayer } = useClippingWorkspace();
  const { currentTime, duration, seek } = audioPlayer;

  const progressRef = useRef<HTMLDivElement>(null);
  const filledRef = useRef<HTMLDivElement>(null);

  // Update progress bar using direct DOM manipulation for smooth animation
  useEffect(() => {
    if (filledRef.current && duration > 0) {
      const percentage = (currentTime / duration) * 100;
      filledRef.current.style.width = `${percentage}%`;
    }
  }, [currentTime, duration]);

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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="h-2 w-full cursor-pointer bg-muted"
      onClick={handleClick}
      onPointerDown={handleDrag}
      ref={progressRef}
    >
      <div
        className="h-full bg-primary will-change-[width]"
        ref={filledRef}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

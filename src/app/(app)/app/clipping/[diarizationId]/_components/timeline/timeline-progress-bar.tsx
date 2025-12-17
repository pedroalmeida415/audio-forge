"use client";

import { useEffect, useRef } from "react";
import { usePlaybackContext } from "../../_context/playback.context";
import { useClippingWorkspaceStore } from "../../_context/store.context";

export function TimelineProgressBar() {
  const { seek } = usePlaybackContext();
  const duration = useClippingWorkspaceStore((s) => s.duration);
  const store = useClippingWorkspaceStore();

  const progressRef = useRef<HTMLDivElement>(null);
  const filledRef = useRef<HTMLDivElement>(null);

  // Subscribe to time updates for direct DOM manipulation (bypasses React)
  useEffect(() => {
    if (!duration || duration <= 0) return;

    // Set initial position
    const initialTime = store.getState().currentTime;
    if (filledRef.current) {
      const percentage = (initialTime / duration) * 100;
      filledRef.current.style.width = `${percentage}%`;
    }

    const unsubscribe = store.subscribe(
      (state) => state.currentTime,
      (time) => {
        if (filledRef.current) {
          const percentage = (time / duration) * 100;
          filledRef.current.style.width = `${percentage}%`;
        }
      },
    );

    return unsubscribe;
  }, [store, duration]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration <= 0) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    seek(Math.max(0, Math.min(newTime, duration)));
  };

  const handleDrag = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  const currentTime = store.getState().currentTime;

  return (
    <div
      aria-label="Audio progress"
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={currentTime}
      className="h-2 w-full cursor-pointer bg-muted"
      onClick={handleClick}
      onKeyDown={(e) => {
        const time = store.getState().currentTime;
        if (e.key === "ArrowLeft") seek(Math.max(0, time - 5));
        if (e.key === "ArrowRight") seek(Math.min(duration, time + 5));
      }}
      onPointerDown={handleDrag}
      ref={progressRef}
      role="slider"
      tabIndex={0}
    >
      <div className="h-full bg-primary will-change-[width]" ref={filledRef} />
    </div>
  );
}

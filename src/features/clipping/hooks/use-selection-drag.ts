"use client";

import { useCallback, useRef } from "react";
import type { $ClippingStore } from "~/features/clipping/store/clipping-store";
import { SELECTION_CONSTANTS } from "~/features/clipping/store/constants";

const { DRAG_THRESHOLD } = SELECTION_CONSTANTS;

/**
 * Hook that handles click-and-drag selection on the timeline.
 *
 * Features:
 * - Distinguishes between simple clicks (seek) and drags (create selection)
 * - Uses distance threshold (5px) before considering it a drag
 * - RAF-throttled drag updates for smooth performance
 * - Ignores clicks on existing segments and the scrubber
 *
 * Returns handlers for mousedown, mousemove, and mouseleave events.
 */
export function useSelectionDrag($store: $ClippingStore) {
  const isDraggingRef = useRef(false);
  const startPosRef = useRef<{ x: number; time: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingTimeRef = useRef<number | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle left click
      if (e.button !== 0) return;

      // Don't start selection if clicking on an existing segment
      const target = e.target as HTMLElement;
      if (target.closest("[data-segment-id]")) return;

      // Don't start selection if clicking on the scrubber
      if (target.closest("[data-scrubber]")) return;

      const { scrollContainerRef } = $store.playback.refs.peek();
      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollOffset = $store.timeline.scrollOffset.peek();
      const clickX = e.clientX - rect.left + scrollOffset;
      const time = $store.playback.pixelsToTime(clickX);
      const duration = $store.playback.duration.peek();
      const clampedTime = Math.max(0, Math.min(time, duration));

      startPosRef.current = { x: e.clientX, time: clampedTime };
      isDraggingRef.current = false;

      const applyPending = () => {
        rafIdRef.current = null;
        if (pendingTimeRef.current !== null) {
          $store.selection.updateDrag(pendingTimeRef.current);
          pendingTimeRef.current = null;
        }
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!startPosRef.current) return;

        const distance = Math.abs(moveEvent.clientX - startPosRef.current.x);

        // Start dragging if threshold exceeded
        if (!isDraggingRef.current && distance > DRAG_THRESHOLD) {
          isDraggingRef.current = true;
          $store.selection.startDrag(startPosRef.current.time);
        }

        if (isDraggingRef.current) {
          const rect = container.getBoundingClientRect();
          const scrollOffset = $store.timeline.scrollOffset.peek();
          const currentX = moveEvent.clientX - rect.left + scrollOffset;
          const currentTime = $store.playback.pixelsToTime(currentX);
          const duration = $store.playback.duration.peek();

          pendingTimeRef.current = Math.max(0, Math.min(currentTime, duration));

          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(applyPending);
          }
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        if (isDraggingRef.current) {
          // Apply any pending update
          if (pendingTimeRef.current !== null) {
            $store.selection.updateDrag(pendingTimeRef.current);
          }
          $store.selection.confirmSelection();
        } else {
          // Simple click - seek to position
          if (startPosRef.current) {
            $store.playback.seek(startPosRef.current.time);
          }
        }

        startPosRef.current = null;
        pendingTimeRef.current = null;
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [$store],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't update hover if currently dragging
      if (isDraggingRef.current || startPosRef.current) return;

      // Don't show hover playhead when over segments or scrubber
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-segment-id]") ||
        target.closest("[data-scrubber]")
      ) {
        $store.selection.setHoverTime(null);
        return;
      }

      const { scrollContainerRef } = $store.playback.refs.peek();
      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollOffset = $store.timeline.scrollOffset.peek();
      const mouseX = e.clientX - rect.left + scrollOffset;
      const time = $store.playback.pixelsToTime(mouseX);
      const duration = $store.playback.duration.peek();
      const clampedTime = Math.max(0, Math.min(time, duration));

      $store.selection.setHoverTime(clampedTime);
    },
    [$store],
  );

  const handleMouseLeave = useCallback(() => {
    $store.selection.setHoverTime(null);
  }, [$store]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseLeave,
  };
}

"use client";

import { observe } from "@legendapp/state";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useClippingStore } from "../../_context/store.context";

interface HandlePosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Portal-based resize handles for the active selection.
 *
 * Renders two draggable handles (left/right edges) that overlay the active
 * selection area in the timeline. Uses getBoundingClientRect() to track
 * position and updates reactively when scroll/zoom changes.
 *
 * Only visible when selection mode is 'active'.
 */
export function SelectionResizeHandles() {
  const $store = useClippingStore();

  const [position, setPosition] = useState<HandlePosition | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we only render portal after mount (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track selection position by calculating from state
  useEffect(() => {
    const dispose = observe(() => {
      const mode = $store.selection.mode.get();
      const bounds = $store.selection.getSelectionPixelBounds.get();
      const scrollOffset = $store.timeline.scrollOffset.get();

      if (mode !== "active" || !bounds) {
        setPosition(null);
        return;
      }

      // Find the segments bar container for viewport offset
      const container = document.querySelector(
        "[data-timeline-segments-bar]",
      ) as HTMLElement | null;
      if (!container) {
        setPosition(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();

      // Calculate position from selection bounds
      const x = bounds.left - scrollOffset;

      setPosition({
        left: containerRect.left + x,
        top: containerRect.top,
        width: bounds.width,
        height: containerRect.height,
      });
    });

    return dispose;
  }, [$store]);

  const handleMouseDown = (edge: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const mode = $store.selection.mode.peek();
    if (mode !== "active") return;

    const range = $store.selection.getSelectionRange.peek();
    if (!range) return;

    const startX = e.clientX;
    const originalTime = edge === "start" ? range.start : range.end;
    const pps = $store.timeline.getPixelsPerSecond.peek();
    const duration = $store.playback.duration.peek();

    let pendingTime: number | null = null;
    let rafId: number | null = null;

    const applyPending = () => {
      rafId = null;
      if (pendingTime === null) return;
      $store.selection.adjustEdge(edge, pendingTime);
      pendingTime = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      const newTime = originalTime + deltaTime;

      // Clamp to valid bounds
      pendingTime = Math.max(0, Math.min(newTime, duration));

      if (rafId === null) {
        rafId = requestAnimationFrame(applyPending);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (rafId !== null) cancelAnimationFrame(rafId);
      if (pendingTime !== null) applyPending();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (!mounted || !position) return null;

  return createPortal(
    <>
      {/* Left handle (adjusts start time) */}
      <div
        className="fixed z-50 cursor-ew-resize"
        style={{
          left: position.left - 4,
          top: position.top,
          width: 8,
          height: position.height,
        }}
        onMouseDown={handleMouseDown("start")}
        data-selection-ui
      >
        <div className="mx-auto h-full w-1 rounded-full bg-primary" />
      </div>

      {/* Right handle (adjusts end time) */}
      <div
        className="fixed z-50 cursor-ew-resize"
        style={{
          left: position.left + position.width - 4,
          top: position.top,
          width: 8,
          height: position.height,
        }}
        onMouseDown={handleMouseDown("end")}
        data-selection-ui
      >
        <div className="mx-auto h-full w-1 rounded-full bg-primary" />
      </div>
    </>,
    document.body,
  );
}

"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

interface HandlePosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Portal-based resize handles for the active segment.
 *
 * Renders two draggable handles (left/right edges) that overlay the active
 * segment button in the timeline. Uses getBoundingClientRect() to track
 * position and updates reactively when scroll/zoom changes.
 */
export function SegmentResizeHandles() {
  const $store = useClippingStore();
  const fileId = useSelector(() => $store.fileId.get());
  const updateSegmentsMutation = api.file.updateSegments.useMutation();

  const [position, setPosition] = useState<HandlePosition | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we only render portal after mount (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track active segment position by calculating from state
  // This avoids race conditions with DOM queries
  useEffect(() => {
    const dispose = observe(() => {
      const activeId = $store.activeSegmentId.get();
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();

      if (!activeId) {
        setPosition(null);
        return;
      }

      // Find segment index and subscribe to its times reactively
      const segments = $store.segments.get();
      const segmentIndex = segments.findIndex((s) => s.id === activeId);
      if (segmentIndex === -1) {
        setPosition(null);
        return;
      }

      // Subscribe to segment's start/end so handles update during drag
      const start = $store.segments[segmentIndex]?.start.get() ?? 0;
      const end = $store.segments[segmentIndex]?.end.get() ?? 0;

      // Find the segments bar container for viewport offset
      const container = document.querySelector(
        "[data-timeline-segments-bar]",
      ) as HTMLElement | null;
      if (!container) {
        setPosition(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();

      // Calculate position from segment times (same formula as segments bar)
      const x = start * pps - scrollOffset;
      const width = Math.max((end - start) * pps, 4);

      setPosition({
        left: containerRect.left + x,
        top: containerRect.top,
        width: width,
        height: containerRect.height,
      });
    });

    return dispose;
  }, [$store]);

  const handleMouseDown = (edge: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const activeId = $store.activeSegmentId.peek();
    if (!activeId) return;

    const segment = $store.segments.peek().find((s) => s.id === activeId);
    if (!segment) return;

    const startX = e.clientX;
    const originalStart = segment.start;
    const originalEnd = segment.end;
    const pps = $store.timeline.getPixelsPerSecond.peek();
    const duration = $store.playback.duration.peek();

    let pendingTime: number | null = null;
    let rafId: number | null = null;

    const applyPending = () => {
      rafId = null;
      if (pendingTime === null) return;

      const segmentIndex = $store.segments
        .peek()
        .findIndex((s) => s.id === activeId);
      if (segmentIndex === -1) return;

      if (edge === "start") {
        // Clamp: start must be < end and >= 0
        const newStart = Math.max(
          0,
          Math.min(pendingTime, originalEnd - 0.001),
        );
        $store.segments[segmentIndex]?.start.set(newStart);
      } else {
        // Clamp: end must be > start and <= duration
        const newEnd = Math.min(
          duration,
          Math.max(pendingTime, originalStart + 0.001),
        );
        $store.segments[segmentIndex]?.end.set(newEnd);
      }
      pendingTime = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;

      pendingTime =
        edge === "start" ? originalStart + deltaTime : originalEnd + deltaTime;

      if (rafId === null) {
        rafId = requestAnimationFrame(applyPending);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (rafId !== null) cancelAnimationFrame(rafId);
      if (pendingTime !== null) applyPending();

      // Persist via mutation
      const updatedSegment = $store.segments
        .peek()
        .find((s) => s.id === activeId);
      if (!updatedSegment) return;

      // Only call mutation if value actually changed
      if (edge === "start" && updatedSegment.start !== originalStart) {
        updateSegmentsMutation.mutate({
          fileId,
          segmentIds: activeId,
          updates: { start: updatedSegment.start },
        });
      } else if (edge === "end" && updatedSegment.end !== originalEnd) {
        updateSegmentsMutation.mutate({
          fileId,
          segmentIds: activeId,
          updates: { end: updatedSegment.end },
        });
      }
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
      >
        <div className="mx-auto h-full w-1 rounded-full bg-primary" />
      </div>
    </>,
    document.body,
  );
}

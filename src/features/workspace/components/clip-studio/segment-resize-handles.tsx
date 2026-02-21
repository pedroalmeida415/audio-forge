"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { useWorkspaceUpdateSegmentsMutation } from "~/features/workspace/hooks/use-workspace-mutations";

interface HandlePosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SegmentResizeHandlesProps {
  segments: {
    id: string;
    speakerId: string;
    startTime: number;
    endTime: number;
  }[];
  sourceId: string;
  activeSegmentId: string | null;
}

/**
 * Portal-based resize handles for the active segment.
 *
 * Renders two draggable handles (left/right edges) that overlay the active
 * segment button in the timeline. Uses getBoundingClientRect() to track
 * position and updates reactively when scroll/zoom changes.
 */
export function SegmentResizeHandles({
  segments,
  sourceId,
  activeSegmentId,
}: SegmentResizeHandlesProps) {
  const { store, computed } = useWorkspaceStore();
  const updateSegmentsMutation = useWorkspaceUpdateSegmentsMutation({
    sourceId,
  });

  const [position, setPosition] = useState<HandlePosition | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we only render portal after mount (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track active segment position by calculating from state
  // This avoids race conditions with DOM queries
  useEffect(() => {
    const dispose = effect(() => {
      const scrollOffset = store.scrollOffset;
      const pps = computed.pixelsPerSecond;

      if (!activeSegmentId) {
        setPosition(null);
        return;
      }

      // Find segment from props
      const segment = segments.find((s) => s.id === activeSegmentId);
      if (!segment) {
        setPosition(null);
        return;
      }

      const start = segment.startTime;
      const end = segment.endTime;

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
  }, [store, computed, segments, activeSegmentId]);

  const handleMouseDown = (edge: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!activeSegmentId) return;

    const segment = segments.find((s) => s.id === activeSegmentId);
    if (!segment) return;

    const startX = e.clientX;
    const originalStart = segment.startTime;
    const originalEnd = segment.endTime;
    const pps = computed.pixelsPerSecond;
    const duration = store.duration;

    let pendingTime: number | null = null;
    let rafId: number | null = null;

    const applyPending = () => {
      rafId = null;
      if (pendingTime === null) return;

      // Note: Since segments are props (from React Query), we can't mutate them directly.
      // We apply the pending time via the tRPC mutation on mouse up.
      // During drag, we update the position visually through the effect.
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

      // Persist via mutation using the last pending time
      if (pendingTime !== null) {
        if (edge === "start") {
          const newStart = Math.max(
            0,
            Math.min(pendingTime, originalEnd - 0.001),
          );
          if (newStart !== originalStart) {
            updateSegmentsMutation.mutate({
              segmentIds: [activeSegmentId],
              patch: { startTime: newStart },
            });
          }
        } else {
          const newEnd = Math.min(
            duration,
            Math.max(pendingTime, originalStart + 0.001),
          );
          if (newEnd !== originalEnd) {
            updateSegmentsMutation.mutate({
              segmentIds: [activeSegmentId],
              patch: { endTime: newEnd },
            });
          }
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (!mounted || !position || !activeSegmentId) return null;

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

"use client";

import { useEffect, useRef } from "react";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";

/**
 * Formats time in MM:SS.mmm format
 * @param seconds - Time in seconds
 * @returns Formatted string like "01:23.456"
 */
function formatTimeWithMs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

/**
 * Hover playhead component that shows where the mouse is positioned on the timeline.
 *
 * Displays a gray vertical line with a time tooltip (MM:SS.mmm format).
 * Hidden during selection dragging/active states or when mouse leaves timeline.
 *
 * Uses effect() for direct DOM manipulation to avoid re-renders.
 */
export function HoverPlayhead() {
  const { store, computed } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Subscribe to hover time and selection mode for direct DOM updates
  useEffect(() => {
    const dispose = effect(() => {
      const hoverTime = store.hoverTime;
      const mode = store.selectionMode;
      const pps = computed.pixelsPerSecond;
      const scrollOffset = store.scrollOffset;

      const containerEl = containerRef.current;
      const tooltipEl = tooltipRef.current;
      if (!containerEl || !tooltipEl) return;

      // Hide if no hover time or if selection is active
      if (hoverTime === null || mode !== "idle") {
        containerEl.style.display = "none";
        return;
      }

      // Calculate position
      const xPos = hoverTime * pps - scrollOffset;

      // Show and position
      containerEl.style.display = "block";
      containerEl.style.transform = `translateX(${xPos}px)`;

      // Update tooltip text
      tooltipEl.textContent = formatTimeWithMs(hoverTime);
    });

    return dispose;
  }, [store, computed]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-y-0 left-0 z-10 will-change-transform"
      style={{ display: "none" }}
    >
      {/* Vertical line */}
      <div className="-translate-x-px absolute inset-y-0 left-0 w-0.5 bg-muted-foreground/50" />

      {/* Time tooltip */}
      <div
        ref={tooltipRef}
        className="-translate-x-1/2 absolute top-1 left-0 rounded bg-popover px-1.5 py-0.5 font-mono text-popover-foreground text-xs shadow-sm"
      />
    </div>
  );
}

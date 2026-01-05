"use client";

import { useClippingStore } from "~/features/clipping/context/store.context";
import { useSelectionDrag } from "~/features/clipping/hooks/use-selection-drag";
import { useTimelineResize } from "~/features/clipping/hooks/use-timeline-resize";
import { useWheelZoom } from "~/features/clipping/hooks/use-wheel-zoom";
import { HoverPlayhead } from "./hover-playhead";
import { SegmentResizeHandles } from "./segment-resize-handles";
import { SelectionOverlay } from "./selection-overlay";
import { SelectionResizeHandles } from "./selection-resize-handles";
import { TimelineProgressBar } from "./timeline-progress-bar";
import { TimelineScrollbar } from "./timeline-scrollbar";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

/**
 * Timeline container using Legend-State's "render once" pattern.
 *
 * Uses manual scroll handling with transform-based positioning.
 * Native scroll is disabled - scrollOffset in store controls virtual scroll position.
 *
 * Supports click-and-drag segment creation via the selection system.
 */
export function TimelineContainer() {
  const $store = useClippingStore();
  const { refs } = $store.playback.peek();
  const { scrollContainerRef } = refs;

  const containerRef = useTimelineResize();

  // Enable Ctrl+wheel zooming and Shift+wheel scrolling
  useWheelZoom($store);

  // Enable click-and-drag selection for segment creation
  const { handleMouseDown, handleMouseMove, handleMouseLeave } =
    useSelectionDrag($store);

  return (
    <div
      className="flex h-56 shrink-0 flex-col border-t bg-muted/20"
      ref={containerRef}
    >
      {/* Progress bar - subscribes to store internally */}
      <TimelineProgressBar />

      {/* Toolbar - subscribes to store internally */}
      <TimelineToolbar />

      {/* Timeline content - no native scroll, manual handling via transforms */}
      <div
        className="relative flex-1 cursor-crosshair overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        ref={scrollContainerRef}
        role="region"
      >
        {/* Scrubber (playhead) - subscribes to store internally */}
        <TimelineScrubber />

        {/* Hover playhead - shows time at mouse position */}
        <HoverPlayhead />

        {/* Selection overlay - shows drag selection area */}
        <SelectionOverlay />

        {/* Stacked timeline elements - each handles its own scroll offset */}
        <div className="flex h-full flex-col">
          {/* Timestamps - subscribes to store internally */}
          <TimelineTimestamps />

          {/* Segments bar - subscribes to store internally */}
          <TimelineSegmentsBar />

          {/* Waveform - subscribes to store internally */}
          <TimelineWaveform />
        </div>

        {/* Custom scrollbar */}
        <TimelineScrollbar />
      </div>

      {/* Segment resize handles - portal renders to document.body */}
      <SegmentResizeHandles />

      {/* Selection resize handles - portal renders to document.body */}
      <SelectionResizeHandles />
    </div>
  );
}

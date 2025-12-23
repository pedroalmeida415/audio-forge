"use client";

import { useValue } from "@legendapp/state/react";
import { useClippingStore } from "../../_context/store.context";
import { useTimelineResize } from "../../_hooks/use-timeline-resize";
import { useWheelZoom } from "../../_hooks/use-wheel-zoom";
import { calculatePixelsPerSecond } from "../../_utils/zoom-utils";
import { TimelineProgressBar } from "./timeline-progress-bar";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

export function TimelineContainer() {
  const $store = useClippingStore();
  const { handleTimelineClick, refs } = $store.playback.peek();
  const { scrollContainerRef } = refs;

  // Subscribe only to what's needed for layout
  const duration = useValue($store.playback.duration);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  const containerRef = useTimelineResize();

  // Enable Ctrl+wheel zooming
  useWheelZoom($store);

  // Compute total width for the scrollable area
  const pixelsPerSecond = calculatePixelsPerSecond(
    zoomLevel,
    duration,
    containerWidth,
  );
  const totalWidth = Math.max(duration * pixelsPerSecond, containerWidth);

  return (
    <div
      className="flex h-56 shrink-0 flex-col border-t bg-muted/20"
      ref={containerRef}
    >
      {/* Progress bar - subscribes to store internally */}
      <TimelineProgressBar />

      {/* Toolbar - subscribes to store internally */}
      <TimelineToolbar />

      {/* Scrollable timeline content */}
      <div
        className="relative flex-1 cursor-crosshair overflow-x-auto overflow-y-hidden"
        onClick={handleTimelineClick}
        onKeyDown={() => {}}
        ref={scrollContainerRef}
        role="region"
      >
        <div className="relative h-full" style={{ width: totalWidth }}>
          {/* Scrubber - subscribes to store internally */}
          <TimelineScrubber />

          {/* Stacked timeline elements */}
          <div className="flex h-full flex-col">
            {/* Timestamps - subscribes to store internally */}
            <TimelineTimestamps />

            {/* Segments bar - subscribes to store internally */}
            <TimelineSegmentsBar />

            {/* Waveform - subscribes to store internally */}
            <TimelineWaveform />
          </div>
        </div>
      </div>
    </div>
  );
}

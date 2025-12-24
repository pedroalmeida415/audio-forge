"use client";

import { $React } from "@legendapp/state/react-web";
import { useEffect } from "react";
import { useClippingStore } from "../../_context/store.context";
import { useTimelineResize } from "../../_hooks/use-timeline-resize";
import { useWheelZoom } from "../../_hooks/use-wheel-zoom";
import { TimelineProgressBar } from "./timeline-progress-bar";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

/**
 * Timeline container using Legend-State's "render once" pattern.
 *
 * The container renders once. The scrollable content div uses $React.div
 * with reactive $style to update its width when zoom changes.
 */
export function TimelineContainer() {
  const $store = useClippingStore();
  const { handleTimelineClick, refs } = $store.playback.peek();
  const { scrollContainerRef } = refs;

  const containerRef = useTimelineResize();

  // Enable Ctrl+wheel zooming
  useWheelZoom($store);

  // Sync scroll position to store for virtualization
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      $store.timeline.setScrollLeft(container.scrollLeft);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [$store, scrollContainerRef]);

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
        <$React.div
          className="relative h-full"
          $style={() => ({ width: $store.timeline.getTotalWidth.get() })}
        >
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
        </$React.div>
      </div>
    </div>
  );
}

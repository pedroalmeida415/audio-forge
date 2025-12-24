"use client";

import { observe } from "@legendapp/state";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";

/**
 * Timeline timestamps with direct DOM manipulation.
 *
 * Pre-generates all marks once, then updates visibility and positions
 * directly via DOM manipulation when scroll/zoom changes.
 */
export function TimelineTimestamps() {
  const $store = useClippingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const [marks, setMarks] = useState<{ time: number; major: boolean }[]>([]);

  // Generate marks once when duration is available
  useEffect(() => {
    const dispose = observe(() => {
      const duration = $store.playback.duration.get();
      if (duration <= 0) return;

      // Generate marks at fixed 1-second intervals
      const baseInterval = 1;
      const newMarks: { time: number; major: boolean }[] = [];

      for (let t = 0; t <= duration; t += baseInterval) {
        const time = Math.round(t * 1000) / 1000;
        newMarks.push({
          time,
          // Major marks at 2s intervals (will adjust visibility based on zoom)
          major: time % 2 < 0.001,
        });
      }

      setMarks(newMarks);
    });

    return dispose;
  }, [$store]);

  // Update positions and visibility on scroll/zoom
  useEffect(() => {
    if (marks.length === 0) return;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerWidth = $store.timeline.containerWidth.get();
      const visibleTimespan = $store.timeline.getVisibleTimespan.get();

      // Determine which interval levels to show based on zoom
      const { showMinor, majorInterval } =
        getVisibilitySettings(visibleTimespan);

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps;
      const visibleEndTime = (scrollOffset + containerWidth) / pps;
      const overscan = 2; // seconds

      marksRef.current.forEach((el, time) => {
        // Check if mark is visible
        const isInRange =
          time >= visibleStartTime - overscan &&
          time <= visibleEndTime + overscan;

        if (!isInRange) {
          el.style.display = "none";
          return;
        }

        // Determine if this mark should be shown at current zoom
        const isMajor = time % majorInterval < 0.001;
        const isMinor = !isMajor;

        if (isMinor && !showMinor) {
          el.style.display = "none";
          return;
        }

        // Position and show the mark
        const x = time * pps - scrollOffset;
        el.style.display = "flex";
        el.style.transform = `translateX(${x}px)`;

        // Update major/minor styling
        const dot = el.firstElementChild as HTMLElement | null;
        const label = el.lastElementChild as HTMLElement | null;

        if (isMajor) {
          // Major mark: show tick line and label
          if (dot) {
            dot.className = "h-2 w-px bg-muted-foreground/50";
          }
        } else {
          // Minor mark: show dot only
          if (dot) {
            dot.className =
              "h-1 w-1 rounded-full bg-muted-foreground/30 mt-0.5";
          }
          if (label) {
            label.style.display = "none";
          }
        }
      });
    });

    return dispose;
  }, [marks, $store]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none relative h-6 shrink-0 overflow-hidden border-b bg-muted/30"
    >
      {marks.map((mark) => (
        <div
          key={mark.time}
          ref={(el) => {
            if (el) {
              marksRef.current.set(mark.time, el);
            } else {
              marksRef.current.delete(mark.time);
            }
          }}
          className="absolute top-0 flex h-full flex-col items-center"
        >
          {/* Dot/tick - will be styled dynamically */}
          <div className="h-2 w-px bg-muted-foreground/50" />
          {/* Label - width:0 + flex center keeps it centered on the mark */}
          <span className="mt-0.5 flex w-0 justify-center whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            {formatTimestamp(mark.time)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Get visibility settings based on visible timespan.
 */
function getVisibilitySettings(visibleTimespan: number): {
  showMinor: boolean;
  majorInterval: number;
} {
  if (visibleTimespan <= 30) {
    // Very zoomed in: show all marks, 2s majors
    return { showMinor: true, majorInterval: 2 };
  }
  if (visibleTimespan <= 60) {
    // Moderately zoomed: show all, 5s majors
    return { showMinor: true, majorInterval: 5 };
  }
  if (visibleTimespan <= 180) {
    // Less zoomed: hide minors, 10s majors
    return { showMinor: false, majorInterval: 10 };
  }
  if (visibleTimespan <= 600) {
    // Wide view: hide minors, 30s majors
    return { showMinor: false, majorInterval: 30 };
  }
  // Very wide view: hide minors, 60s majors
  return { showMinor: false, majorInterval: 60 };
}

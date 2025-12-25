"use client";

import { observe } from "@legendapp/state";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";

const OVERSCAN_TIME = 2; // seconds of overscan

interface MarkData {
  time: number;
}

/**
 * Timeline timestamps with true virtualization.
 *
 * - DOM elements created/removed directly based on visibility
 * - No React state for virtualization - everything via observe()
 * - Minimal DOM footprint at any given time
 */
export function TimelineTimestamps() {
  const $store = useClippingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const markElementsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const marksDataRef = useRef<MarkData[]>([]);

  const [isReady, setIsReady] = useState(false);

  // Generate marks data once when duration is available
  useEffect(() => {
    const dispose = observe(() => {
      const duration = $store.playback.duration.get();
      if (duration <= 0) return;

      // Generate marks at 1-second intervals
      const marks: MarkData[] = [];
      for (let t = 0; t <= duration; t += 1) {
        marks.push({ time: Math.round(t * 1000) / 1000 });
      }

      marksDataRef.current = marks;
      setIsReady(true);
    });

    return dispose;
  }, [$store]);

  // Manage DOM elements directly based on visibility
  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    const container = containerRef.current;
    const marksData = marksDataRef.current;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerWidth = $store.timeline.containerWidth.get();
      const visibleTimespan = $store.timeline.getVisibleTimespan.get();

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps - OVERSCAN_TIME;
      const visibleEndTime = (scrollOffset + containerWidth) / pps + OVERSCAN_TIME;

      // Determine visibility settings based on zoom
      const { showMinor, majorInterval } = getVisibilitySettings(visibleTimespan);

      // Build set of times that should be visible
      const visibleTimes = new Set<number>();
      for (const mark of marksData) {
        const { time } = mark;
        if (time < visibleStartTime || time > visibleEndTime) continue;

        const isMajor = time % majorInterval < 0.001;
        if (!isMajor && !showMinor) continue;

        visibleTimes.add(time);
      }

      // Remove marks that are no longer visible
      markElementsMap.current.forEach((el, time) => {
        if (!visibleTimes.has(time)) {
          el.remove();
          markElementsMap.current.delete(time);
        }
      });

      // Add/update marks for visible times
      visibleTimes.forEach((time) => {
        const isMajor = time % majorInterval < 0.001;
        const x = time * pps - scrollOffset;

        // Create element if it doesn't exist
        let el = markElementsMap.current.get(time);
        if (!el) {
          el = createMarkElement(time, isMajor);
          container.appendChild(el);
          markElementsMap.current.set(time, el);
        }

        // Update position and styling
        el.style.transform = `translateX(${x}px)`;

        // Update major/minor styling if needed
        const dot = el.firstElementChild as HTMLElement | null;
        const label = el.lastElementChild as HTMLElement | null;

        if (isMajor) {
          if (dot) dot.className = "h-2 w-px bg-muted-foreground/50";
          if (label) label.style.display = "flex";
        } else {
          if (dot) dot.className = "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 mt-0.5";
          if (label) label.style.display = "none";
        }
      });
    });

    return () => {
      dispose();
      // Clean up all mark elements
      for (const el of markElementsMap.current.values()) {
        el.remove();
      }
      markElementsMap.current.clear();
    };
  }, [isReady, $store]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none relative h-6 shrink-0 overflow-hidden border-b bg-muted/30"
    />
  );
}

/**
 * Create a mark element with dot and label.
 */
function createMarkElement(time: number, isMajor: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "absolute top-0 flex h-full flex-col items-center";

  // Dot/tick
  const dot = document.createElement("div");
  dot.className = isMajor
    ? "h-2 w-px bg-muted-foreground/50"
    : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 mt-0.5";
  el.appendChild(dot);

  // Label (width:0 + flex center keeps it centered on the mark)
  const label = document.createElement("span");
  label.className =
    "mt-0.5 flex w-0 justify-center font-mono text-[10px] text-muted-foreground whitespace-nowrap";
  label.textContent = formatTimestamp(time);
  label.style.display = isMajor ? "flex" : "none";
  el.appendChild(label);

  return el;
}

/**
 * Get visibility settings based on visible timespan.
 */
function getVisibilitySettings(visibleTimespan: number): {
  showMinor: boolean;
  majorInterval: number;
} {
  if (visibleTimespan <= 30) {
    return { showMinor: true, majorInterval: 2 };
  }
  if (visibleTimespan <= 60) {
    return { showMinor: true, majorInterval: 5 };
  }
  if (visibleTimespan <= 180) {
    return { showMinor: false, majorInterval: 10 };
  }
  if (visibleTimespan <= 600) {
    return { showMinor: false, majorInterval: 30 };
  }
  return { showMinor: false, majorInterval: 60 };
}

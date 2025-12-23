"use client";

import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";
import {
  calculatePixelsPerSecond,
  calculateVisibleTimespan,
} from "../../_utils/zoom-utils";

export function TimelineTimestamps() {
  const $store = useClippingStore();

  // Subscribe to store values
  const duration = useValue($store.playback.duration);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  // Compute derived values
  const visibleTimespan = calculateVisibleTimespan(zoomLevel, duration);
  const pixelsPerSecond = calculatePixelsPerSecond(
    zoomLevel,
    duration,
    containerWidth,
  );

  // Generate timestamp marks based on visible timespan
  const marks = useMemo(() => {
    const result: { time: number; major: boolean }[] = [];

    let majorInterval: number;
    let minorInterval: number;

    // Adjust intervals based on visible timespan instead of zoom level
    if (visibleTimespan <= 30) {
      // Very zoomed in: show 2s majors, 0.5s minors
      majorInterval = 2;
      minorInterval = 0.5;
    } else if (visibleTimespan <= 60) {
      // Moderately zoomed: show 5s majors, 1s minors
      majorInterval = 5;
      minorInterval = 1;
    } else if (visibleTimespan <= 180) {
      // Less zoomed: show 10s majors, 2s minors
      majorInterval = 10;
      minorInterval = 2;
    } else if (visibleTimespan <= 600) {
      // Wide view: show 30s majors, 5s minors
      majorInterval = 30;
      minorInterval = 5;
    } else {
      // Very wide view: show 60s majors, 10s minors
      majorInterval = 60;
      minorInterval = 10;
    }

    const maxTime = Math.max(duration, visibleTimespan);

    for (let t = 0; t <= maxTime; t += minorInterval) {
      result.push({
        time: t,
        major: t % majorInterval === 0,
      });
    }

    return result;
  }, [duration, visibleTimespan]);

  const timeToPixels = (time: number) => time * pixelsPerSecond;

  return (
    <div className="pointer-events-none relative h-6 shrink-0 overflow-hidden border-b bg-muted/30">
      {marks.map((mark) => (
        <div
          className="absolute top-0 flex h-full flex-col items-center"
          key={mark.time}
          style={{ left: timeToPixels(mark.time) }}
        >
          {mark.major ? (
            <>
              <div className="h-2 w-px bg-muted-foreground/50" />
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(mark.time)}
              </span>
            </>
          ) : (
            <div className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/30" />
          )}
        </div>
      ))}
    </div>
  );
}

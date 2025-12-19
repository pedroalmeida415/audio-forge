"use client";

import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { formatTimestamp } from "~/lib/time-utils";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

export function TimelineTimestamps() {
  const $store = useClippingStore();

  // Subscribe to store values
  const duration = useValue($store.playback.duration);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const containerWidth = useValue($store.timeline.containerWidth);

  // Compute derived values
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;

  // Generate timestamp marks based on zoom level
  const marks = useMemo(() => {
    const result: { time: number; major: boolean }[] = [];

    let majorInterval: number;
    let minorInterval: number;

    if (zoomLevel >= 200) {
      majorInterval = 2;
      minorInterval = 0.5;
    } else if (zoomLevel >= 100) {
      majorInterval = 5;
      minorInterval = 1;
    } else if (zoomLevel >= 50) {
      majorInterval = 10;
      minorInterval = 2;
    } else {
      majorInterval = 30;
      minorInterval = 5;
    }

    const maxTime = Math.max(duration, visibleTimespan);

    for (let t = 0; t <= maxTime; t += minorInterval) {
      result.push({
        time: t,
        major: t % majorInterval === 0,
      });
    }

    return result;
  }, [duration, visibleTimespan, zoomLevel]);

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

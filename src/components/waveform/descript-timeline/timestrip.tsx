"use client";

import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { formatTimeSimple, TIMELINE_CONSTANTS } from "./timeline-styles";

type TimestripProps = {
  duration: number;
  pxPerSec: number;
  scrollX: number;
  containerWidth: number;
};

type TimeMarker = {
  time: number;
  x: number;
  label: string;
  isZero: boolean;
};

/**
 * Calculate appropriate marker interval based on zoom level
 */
function getMarkerInterval(pxPerSec: number): number {
  if (pxPerSec >= 200) return 0.5;
  if (pxPerSec >= 100) return 1;
  if (pxPerSec >= 50) return 2;
  if (pxPerSec >= 25) return 5;
  return 10;
}

/**
 * Calculate tick interval (small dots between markers)
 */
function getTickInterval(markerInterval: number): number {
  if (markerInterval >= 5) return 1;
  if (markerInterval >= 2) return 0.5;
  if (markerInterval >= 1) return 0.25;
  return 0.1;
}

export function Timestrip({
  duration,
  pxPerSec,
  scrollX,
  containerWidth,
}: TimestripProps) {
  const markerInterval = getMarkerInterval(pxPerSec);
  const tickInterval = getTickInterval(markerInterval);

  const { markers, ticks } = useMemo(() => {
    const visibleStartTime = Math.max(0, scrollX / pxPerSec - 1);
    const visibleEndTime = Math.min(
      duration,
      (scrollX + containerWidth) / pxPerSec + 1
    );

    const markers: TimeMarker[] = [];
    const ticks: { x: number }[] = [];

    // Generate markers
    const startMarker = Math.floor(visibleStartTime / markerInterval) * markerInterval;
    for (let time = startMarker; time <= visibleEndTime; time += markerInterval) {
      if (time < 0) continue;
      const x = time * pxPerSec - scrollX;
      markers.push({
        time,
        x,
        label: formatTimeSimple(time),
        isZero: time === 0,
      });
    }

    // Generate ticks (small dots)
    const startTick = Math.floor(visibleStartTime / tickInterval) * tickInterval;
    for (let time = startTick; time <= visibleEndTime; time += tickInterval) {
      if (time < 0) continue;
      // Skip ticks that coincide with markers
      if (Math.abs(time % markerInterval) < 0.001) continue;
      const x = time * pxPerSec - scrollX;
      ticks.push({ x });
    }

    return { markers, ticks };
  }, [duration, pxPerSec, scrollX, containerWidth, markerInterval, tickInterval]);

  return (
    <div
      className="relative bg-background border-b border-border/30 select-none"
      style={{ height: TIMELINE_CONSTANTS.TIMESTRIP_HEIGHT }}
    >
      {/* Tick marks (small dots) */}
      {ticks.map((tick, i) => (
        <div
          key={`tick-${i}`}
          className="absolute top-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-muted-foreground/30"
          style={{ left: tick.x }}
        />
      ))}

      {/* Time markers with labels */}
      {markers.map((marker) => (
        <div
          key={marker.time}
          className="absolute top-0 h-full flex items-center"
          style={{ left: marker.x, transform: "translateX(-50%)" }}
        >
          <span
            className={cn(
              "text-[11px] tabular-nums px-1 bg-background",
              marker.isZero
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  );
}

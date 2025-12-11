"use client";

import { useCallback, useRef } from "react";
import type { ClippingWorkspaceStoreApi } from "./clipping-workspace-store";
import { TIMELINE_CONSTANTS } from "./clipping-workspace-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

/**
 * Helper to calculate pixels per second from store state.
 */
function getPixelsPerSecond(zoomLevel: number, containerWidth: number): number {
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

/**
 * Hook that manages timeline scroll container ref and provides scroll actions.
 * Must be rendered within ClippingWorkspaceStoreProvider.
 */
export function useTimelineRefs(store: ClippingWorkspaceStoreApi) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Convert time to pixel position
  const timeToPixels = useCallback(
    (time: number): number => {
      const { zoomLevel, containerWidth } = store.getState();
      return time * getPixelsPerSecond(zoomLevel, containerWidth);
    },
    [store],
  );

  // Convert pixel position to time
  const pixelsToTime = useCallback(
    (pixels: number): number => {
      const { zoomLevel, containerWidth } = store.getState();
      const pps = getPixelsPerSecond(zoomLevel, containerWidth);
      if (pps <= 0) return 0;
      return pixels / pps;
    },
    [store],
  );

  // Scroll to a specific time position
  const scrollToTime = useCallback(
    (time: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { containerWidth } = store.getState();
      const targetX = timeToPixels(time);
      // Center the time in the viewport
      const scrollLeft = targetX - containerWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior,
      });
    },
    [store, timeToPixels],
  );

  // Get current scroll position as time
  const getScrollTime = useCallback((): number => {
    const container = scrollContainerRef.current;
    if (!container) return 0;
    return pixelsToTime(container.scrollLeft);
  }, [pixelsToTime]);

  // Keep playhead visible during playback
  const ensureTimeVisible = useCallback(
    (time: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { containerWidth } = store.getState();
      const timeX = timeToPixels(time);
      const scrollLeft = container.scrollLeft;
      const scrollRight = scrollLeft + containerWidth;

      // Add some padding (10% of container width)
      const padding = containerWidth * 0.1;

      if (timeX < scrollLeft + padding) {
        container.scrollTo({
          left: Math.max(0, timeX - padding),
          behavior: "smooth",
        });
      } else if (timeX > scrollRight - padding) {
        container.scrollTo({
          left: timeX - containerWidth + padding,
          behavior: "smooth",
        });
      }
    },
    [store, timeToPixels],
  );

  return {
    scrollContainerRef,
    timeToPixels,
    pixelsToTime,
    scrollToTime,
    getScrollTime,
    ensureTimeVisible,
  };
}

export type TimelineActions = ReturnType<typeof useTimelineRefs>;

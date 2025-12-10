"use client";

import { useCallback, useMemo, useRef, useState } from "react";

const BASE_TIMESPAN = 30; // seconds at 100% zoom
const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const DEFAULT_ZOOM = 100;

interface UseTimelineOptions {
  duration: number;
  containerWidth: number;
}

export function useTimeline({ duration, containerWidth }: UseTimelineOptions) {
  const [zoomLevel, setZoomLevelState] = useState(DEFAULT_ZOOM);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Calculate visible timespan based on zoom
  const visibleTimespan = useMemo(() => {
    return (BASE_TIMESPAN * 100) / zoomLevel;
  }, [zoomLevel]);

  // Calculate pixels per second
  const pixelsPerSecond = useMemo(() => {
    if (visibleTimespan <= 0) return 0;
    return containerWidth / visibleTimespan;
  }, [containerWidth, visibleTimespan]);

  // Calculate total timeline width - at least container width
  const totalWidth = useMemo(() => {
    return Math.max(duration * pixelsPerSecond, containerWidth);
  }, [duration, pixelsPerSecond, containerWidth]);

  // Convert time to pixel position
  const timeToPixels = useCallback(
    (time: number): number => {
      return time * pixelsPerSecond;
    },
    [pixelsPerSecond],
  );

  // Convert pixel position to time
  const pixelsToTime = useCallback(
    (pixels: number): number => {
      if (pixelsPerSecond <= 0) return 0;
      return pixels / pixelsPerSecond;
    },
    [pixelsPerSecond],
  );

  // Set zoom level with bounds checking
  const setZoomLevel = useCallback((level: number) => {
    setZoomLevelState(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)));
  }, []);

  // Zoom in/out by a step
  const zoomIn = useCallback(() => {
    setZoomLevelState((prev) => Math.min(MAX_ZOOM, prev + 25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevelState((prev) => Math.max(MIN_ZOOM, prev - 25));
  }, []);

  // Scroll to a specific time position
  const scrollToTime = useCallback(
    (time: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const targetX = timeToPixels(time);
      // Center the time in the viewport
      const scrollLeft = targetX - containerWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior,
      });
    },
    [timeToPixels, containerWidth],
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
    [timeToPixels, containerWidth],
  );

  // Generate timestamp marks for display - extend to fill visible area
  const timestampMarks = useMemo(() => {
    const marks: { time: number; major: boolean }[] = [];

    // Determine interval based on zoom
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

    // Generate marks to cover at least the visible timespan or the full duration
    const maxTime = Math.max(duration, visibleTimespan);

    for (let t = 0; t <= maxTime; t += minorInterval) {
      marks.push({
        time: t,
        major: t % majorInterval === 0,
      });
    }

    return marks;
  }, [duration, zoomLevel, visibleTimespan]);

  return {
    // State
    zoomLevel,
    visibleTimespan,
    pixelsPerSecond,
    totalWidth,
    scrollContainerRef,

    // Zoom controls
    setZoomLevel,
    zoomIn,
    zoomOut,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,

    // Conversions
    timeToPixels,
    pixelsToTime,

    // Scroll controls
    scrollToTime,
    getScrollTime,
    ensureTimeVisible,

    // Display helpers
    timestampMarks,
  };
}

export type Timeline = ReturnType<typeof useTimeline>;

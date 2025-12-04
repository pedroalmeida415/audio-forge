"use client";

import { useCallback, useState } from "react";
import {
  TIMELINE_CONSTANTS,
  pxPerSecToZoomPercent,
  zoomPercentToPxPerSec,
} from "./timeline-styles";

export type TimelineState = {
  /** Current zoom level in pixels per second */
  pxPerSec: number;
  /** Current zoom as percentage (100% = default) */
  zoomPercent: number;
  /** Scroll offset in pixels */
  scrollX: number;
  /** Playback speed multiplier */
  playbackSpeed: number;
};

export type UseTimelineStateReturn = TimelineState & {
  /** Set zoom level by percentage */
  setZoomPercent: (percent: number) => void;
  /** Zoom in by 25% */
  zoomIn: () => void;
  /** Zoom out by 25% */
  zoomOut: () => void;
  /** Set scroll position */
  setScrollX: (x: number) => void;
  /** Set playback speed */
  setPlaybackSpeed: (speed: number) => void;
  /** Calculate time from x position */
  xToTime: (x: number) => number;
  /** Calculate x position from time */
  timeToX: (time: number) => number;
  /** Get total width needed for duration */
  getTotalWidth: (duration: number) => number;
};

export function useTimelineState(): UseTimelineStateReturn {
  const [pxPerSec, setPxPerSec] = useState(TIMELINE_CONSTANTS.DEFAULT_PX_PER_SEC);
  const [scrollX, setScrollX] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const zoomPercent = pxPerSecToZoomPercent(pxPerSec);

  const setZoomPercent = useCallback((percent: number) => {
    const clamped = Math.max(10, Math.min(400, percent));
    setPxPerSec(zoomPercentToPxPerSec(clamped));
  }, []);

  const zoomIn = useCallback(() => {
    setZoomPercent(zoomPercent + 25);
  }, [zoomPercent, setZoomPercent]);

  const zoomOut = useCallback(() => {
    setZoomPercent(zoomPercent - 25);
  }, [zoomPercent, setZoomPercent]);

  const xToTime = useCallback(
    (x: number): number => {
      return (x + scrollX) / pxPerSec;
    },
    [scrollX, pxPerSec]
  );

  const timeToX = useCallback(
    (time: number): number => {
      return time * pxPerSec - scrollX;
    },
    [scrollX, pxPerSec]
  );

  const getTotalWidth = useCallback(
    (duration: number): number => {
      return duration * pxPerSec;
    },
    [pxPerSec]
  );

  return {
    pxPerSec,
    zoomPercent,
    scrollX,
    playbackSpeed,
    setZoomPercent,
    zoomIn,
    zoomOut,
    setScrollX,
    setPlaybackSpeed,
    xToTime,
    timeToX,
    getTotalWidth,
  };
}

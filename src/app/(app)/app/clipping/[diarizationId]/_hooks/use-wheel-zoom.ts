"use client";

import { useEffect } from "react";
import type { $ClippingStore } from "../_store/clipping-store";
import { TIMELINE_CONSTANTS } from "../_store/constants";
import { isZoomEnabled } from "../_utils/zoom-utils";

const { MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR } = TIMELINE_CONSTANTS;

/**
 * Hook that handles Ctrl+wheel zooming on the timeline.
 *
 * Features:
 * - Exponential zoom: each wheel tick multiplies/divides by ZOOM_FACTOR
 * - Zooms towards mouse position when hovering over timeline
 * - Zooms towards playhead when mouse is outside timeline
 * - Updates are batched via zoom actions for atomic state changes
 */
export function useWheelZoom($store: $ClippingStore) {
  useEffect(() => {
    const { scrollContainerRef } = $store.playback.refs.peek();
    const container = scrollContainerRef.current;

    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle zoom when Ctrl is held
      if (!e.ctrlKey) return;

      const duration = $store.playback.duration.peek();

      // Disable zoom for short audio
      if (!isZoomEnabled(duration)) return;

      // Prevent browser zoom
      e.preventDefault();

      const currentZoom = $store.timeline.zoomLevel.peek();

      // Exponential zoom: each wheel tick = one zoom step
      const newZoom =
        e.deltaY > 0 ? currentZoom / ZOOM_FACTOR : currentZoom * ZOOM_FACTOR;

      // Clamp to zoom bounds
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

      if (clampedZoom === currentZoom) return;

      // Check if mouse is over the timeline container
      const rect = container.getBoundingClientRect();
      const isOverTimeline =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      // Commit zoom directly (zoom actions use batch() internally)
      if (isOverTimeline) {
        $store.playback.zoomAtMouse(clampedZoom, e.clientX);
      } else {
        $store.playback.zoomAtPlayhead(clampedZoom);
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [$store]);
}

"use client";

import { useEffect, useRef } from "react";
import type { $ClippingStore } from "../_store/clipping-store";
import { TIMELINE_CONSTANTS } from "../_store/constants";
import { isZoomEnabled } from "../_utils/zoom-utils";

const { MIN_ZOOM, MAX_ZOOM, WHEEL_ZOOM_SPEED, WAVEFORM_DEBOUNCE_MS } =
  TIMELINE_CONSTANTS;

/**
 * Hook that handles Ctrl+wheel zooming on the timeline.
 *
 * - Zooms towards mouse position when hovering over timeline
 * - Zooms towards playhead when mouse is outside timeline
 * - Debounces waveform detail recalculation
 */
export function useWheelZoom($store: $ClippingStore) {
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Calculate zoom delta (negative deltaY = zoom in)
      const zoomDelta = (-e.deltaY * WHEEL_ZOOM_SPEED) / 100;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentZoom + zoomDelta),
      );

      if (newZoom === currentZoom) return;

      // Mark as zooming (for shimmer effect)
      $store.timeline.setIsZooming(true);

      // Check if mouse is over the timeline container
      const rect = container.getBoundingClientRect();
      const isOverTimeline =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isOverTimeline) {
        // Zoom towards mouse position
        $store.playback.zoomAtMouse(newZoom, e.clientX);
      } else {
        // Zoom towards playhead
        $store.playback.zoomAtPlayhead(newZoom);
      }

      // Debounce waveform detail recalculation
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
      }

      zoomDebounceRef.current = setTimeout(() => {
        $store.timeline.setIsZooming(false);
        // Trigger detailed waveform calculation
        // This will be handled by the waveform component
      }, WAVEFORM_DEBOUNCE_MS);
    };

    // Use passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
      }
    };
  }, [$store]);
}

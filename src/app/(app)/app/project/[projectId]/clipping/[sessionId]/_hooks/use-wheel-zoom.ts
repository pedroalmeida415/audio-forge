"use client";

import { useEffect, useRef } from "react";
import type { $ClippingStore } from "../_store/clipping-store";
import { TIMELINE_CONSTANTS } from "../_store/constants";
import { isZoomEnabled } from "../_utils/zoom-utils";

const { MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR } = TIMELINE_CONSTANTS;
const SCROLL_SPEED = 1.5; // Pixels per wheel delta unit

/**
 * Hook that handles wheel interactions on the timeline.
 *
 * Features:
 * - Ctrl+wheel: Exponential zoom (multiplies/divides by ZOOM_FACTOR)
 * - Shift+wheel: Horizontal scroll
 * - Plain wheel: Nothing (no modifier)
 * - RAF-throttled to prevent multiple updates per frame
 */
export function useWheelZoom($store: $ClippingStore) {
  // Track pending state for RAF throttling
  const pendingRef = useRef<{
    type: "zoom" | "scroll";
    // Zoom state
    zoom?: number;
    clientX?: number;
    isOverTimeline?: boolean;
    // Scroll state
    scrollDelta?: number;
  } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const { scrollContainerRef } = $store.playback.refs.peek();
    const container = scrollContainerRef.current;

    if (!container) return;

    const applyPending = () => {
      rafIdRef.current = null;
      const pending = pendingRef.current;
      if (!pending) return;

      pendingRef.current = null;

      if (pending.type === "zoom" && pending.zoom !== undefined) {
        if (pending.isOverTimeline && pending.clientX !== undefined) {
          $store.playback.zoomAtMouse(pending.zoom, pending.clientX);
        } else {
          $store.playback.zoomAtPlayhead(pending.zoom);
        }
      } else if (pending.type === "scroll" && pending.scrollDelta !== undefined) {
        $store.timeline.scrollBy(pending.scrollDelta);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Ctrl+wheel = zoom
      if (e.ctrlKey) {
        const duration = $store.playback.duration.peek();

        // Disable zoom for short audio
        if (!isZoomEnabled(duration)) return;

        // Prevent browser zoom
        e.preventDefault();

        // Get current zoom (use pending if exists, for accumulation)
        const currentZoom =
          pendingRef.current?.type === "zoom" && pendingRef.current.zoom
            ? pendingRef.current.zoom
            : $store.timeline.zoomLevel.peek();

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

        // Store pending zoom
        pendingRef.current = {
          type: "zoom",
          zoom: clampedZoom,
          clientX: e.clientX,
          isOverTimeline,
        };
      }
      // Shift+wheel = horizontal scroll
      else if (e.shiftKey) {
        e.preventDefault();

        // Accumulate scroll delta
        const currentDelta =
          pendingRef.current?.type === "scroll" && pendingRef.current.scrollDelta
            ? pendingRef.current.scrollDelta
            : 0;

        pendingRef.current = {
          type: "scroll",
          scrollDelta: currentDelta + e.deltaY * SCROLL_SPEED,
        };
      }
      // Plain wheel = nothing
      else {
        return;
      }

      // Schedule RAF if not already pending
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(applyPending);
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [$store]);
}

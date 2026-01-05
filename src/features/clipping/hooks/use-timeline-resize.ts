"use client";

import { useEffect, useRef } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";

/**
 * Hook that manages timeline container ref and updates containerWidth in store.
 * Uses ResizeObserver to track container size changes.
 *
 * Must be rendered within ClippingStoreProvider.
 */
export function useTimelineResize() {
  const $store = useClippingStore();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        $store.timeline.setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    // Initial measurement
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [$store]);

  return containerRef;
}

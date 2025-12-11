"use client";

import { useEffect, useRef } from "react";
import type { ClippingWorkspaceStoreApi } from "./clipping-workspace-store";

/**
 * Hook that manages timeline container ref and updates containerWidth in store.
 * Uses ResizeObserver to track container size changes.
 *
 * Must be rendered within ClippingWorkspaceStoreProvider.
 */
export function useContainerRef(store: ClippingWorkspaceStoreApi) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        store.getState().setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    // Initial measurement
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [store]);

  return containerRef;
}

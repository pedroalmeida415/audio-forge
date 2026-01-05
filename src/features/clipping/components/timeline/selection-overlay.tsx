"use client";

import { observe } from "@legendapp/state";
import { useEffect, useRef } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";

/**
 * Selection overlay component that shows the selected time range.
 *
 * Displays a semi-transparent area during drag and active states.
 * Uses different styling for dragging (provisional) vs active (confirmed) states.
 *
 * Uses observe() for direct DOM manipulation to avoid re-renders.
 */
export function SelectionOverlay() {
  const $store = useClippingStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Subscribe to selection state for direct DOM updates
  useEffect(() => {
    const dispose = observe(() => {
      const mode = $store.selection.mode.get();
      const bounds = $store.selection.getSelectionPixelBounds.get();
      const scrollOffset = $store.timeline.scrollOffset.get();

      const overlayEl = overlayRef.current;
      if (!overlayEl) return;

      // Hide if idle or no valid selection
      if (mode === "idle" || !bounds) {
        overlayEl.style.display = "none";
        return;
      }

      // Calculate viewport position
      const viewportLeft = bounds.left - scrollOffset;

      // Show and position
      overlayEl.style.display = "block";
      overlayEl.style.transform = `translateX(${viewportLeft}px)`;
      overlayEl.style.width = `${bounds.width}px`;

      // Different styles for dragging vs active
      if (mode === "dragging") {
        overlayEl.className =
          "pointer-events-none absolute inset-y-0 left-0 z-15 border-x-2 border-primary/50 bg-primary/10 will-change-transform";
      } else {
        // active mode - more prominent styling
        overlayEl.className =
          "pointer-events-none absolute inset-y-0 left-0 z-15 border-x-2 border-primary bg-primary/20 will-change-transform";
      }
    });

    return dispose;
  }, [$store]);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-y-0 left-0 z-15 border-primary/50 border-x-2 bg-primary/10 will-change-transform"
      style={{ display: "none" }}
    />
  );
}

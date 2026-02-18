"use client";

import { useEffect, useRef } from "react";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";

/**
 * Selection overlay component that shows the selected time range.
 *
 * Displays a semi-transparent area during drag and active states.
 * Uses different styling for dragging (provisional) vs active (confirmed) states.
 *
 * Uses effect() for direct DOM manipulation to avoid re-renders.
 */
export function SelectionOverlay() {
  const { store, computed } = useWorkspaceStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Subscribe to selection state for direct DOM updates
  useEffect(() => {
    const dispose = effect(() => {
      const mode = store.selectionMode;
      const bounds = computed.selectionPixelBounds;
      const scrollOffset = store.scrollOffset;

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
  }, [store, computed]);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-y-0 left-0 z-15 border-primary/50 border-x-2 bg-primary/10 will-change-transform"
      style={{ display: "none" }}
    />
  );
}

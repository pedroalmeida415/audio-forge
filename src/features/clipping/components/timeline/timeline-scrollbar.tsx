"use client";

import { useSelector } from "@legendapp/state/react";
import { $React } from "@legendapp/state/react-web";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { cn } from "~/lib/utils";

const SCROLLBAR_HEIGHT = 6;
const FADE_DELAY = 1500; // ms before scrollbar fades out

/**
 * Custom minimal scrollbar for manual scroll handling.
 *
 * Features:
 * - macOS-style minimal design
 * - Fades out after inactivity
 * - Drag thumb to scroll
 * - Click track to jump to position
 */
export function TimelineScrollbar() {
  const $store = useClippingStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to values needed for visibility calculation
  const totalWidth = useSelector(() => $store.timeline.getTotalWidth.get());
  const containerWidth = useSelector(() =>
    $store.timeline.containerWidth.get(),
  );

  // Don't show scrollbar if content fits in container
  const needsScrollbar = totalWidth > containerWidth;

  // Show scrollbar when scroll offset changes
  useEffect(() => {
    if (!needsScrollbar) return;

    const dispose = $store.timeline.scrollOffset.onChange(() => {
      setIsVisible(true);

      // Clear existing timeout
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }

      // Set new fade timeout
      fadeTimeoutRef.current = setTimeout(() => {
        if (!isDragging) {
          setIsVisible(false);
        }
      }, FADE_DELAY);
    });

    return () => {
      dispose();
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, [needsScrollbar, isDragging, $store.timeline.scrollOffset]);

  // Handle track click - jump to position
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const clickRatio = (e.clientX - rect.left) / rect.width;
      const maxOffset = $store.timeline.getMaxScrollOffset.peek();
      const newOffset = clickRatio * maxOffset;

      $store.timeline.setScrollOffset(newOffset);
    },
    [$store],
  );

  // Handle thumb drag with RAF throttling
  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      const startX = e.clientX;
      const startOffset = $store.timeline.scrollOffset.peek();
      const maxOffset = $store.timeline.getMaxScrollOffset.peek();
      const trackWidth = trackRef.current?.clientWidth ?? 1;

      let pendingOffset: number | null = null;
      let rafId: number | null = null;

      const applyPendingOffset = () => {
        rafId = null;
        if (pendingOffset !== null) {
          $store.timeline.setScrollOffset(pendingOffset);
          pendingOffset = null;
        }
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaRatio = deltaX / trackWidth;
        pendingOffset = startOffset + deltaRatio * maxOffset;

        // Schedule RAF if not already pending
        if (rafId === null) {
          rafId = requestAnimationFrame(applyPendingOffset);
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        // Cancel any pending RAF
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }

        // Apply final offset immediately
        if (pendingOffset !== null) {
          $store.timeline.setScrollOffset(pendingOffset);
        }

        // Start fade timer
        fadeTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, FADE_DELAY);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [$store],
  );

  if (!needsScrollbar) return null;

  return (
    <div
      ref={trackRef}
      className={cn(
        "absolute right-2 bottom-1 left-2 rounded-full bg-muted/30 transition-opacity duration-300",
        isVisible || isDragging ? "opacity-100" : "opacity-0",
      )}
      style={{ height: SCROLLBAR_HEIGHT }}
      onClick={handleTrackClick}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => {
        if (!isDragging) {
          fadeTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
          }, FADE_DELAY);
        }
      }}
    >
      {/* Thumb */}
      <$React.div
        className="absolute top-0 h-full cursor-grab rounded-full bg-muted-foreground/50 transition-colors hover:bg-muted-foreground/70 active:cursor-grabbing active:bg-muted-foreground/80"
        onMouseDown={handleThumbMouseDown}
        $style={() => {
          const total = $store.timeline.getTotalWidth.get();
          const container = $store.timeline.containerWidth.get();
          const offset = $store.timeline.scrollOffset.get();
          const maxOffset = $store.timeline.getMaxScrollOffset.get();

          // Thumb width is proportional to visible area
          const thumbWidthPercent = Math.max(10, (container / total) * 100);

          // Thumb position
          const thumbPositionPercent =
            maxOffset > 0
              ? (offset / maxOffset) * (100 - thumbWidthPercent)
              : 0;

          return {
            width: `${thumbWidthPercent}%`,
            left: `${thumbPositionPercent}%`,
          };
        }}
      />
    </div>
  );
}

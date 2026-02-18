"use client";

import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
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
  const { store, computed } = useWorkspaceStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to values needed for visibility calculation
  const snap = useSnapshot(store);
  const { totalWidth, maxScrollOffset } = useSnapshot(computed);
  const containerWidth = snap.containerWidth;

  // Don't show scrollbar if content fits in container
  const needsScrollbar = totalWidth > containerWidth;

  // Show scrollbar when scroll offset changes via effect()
  useEffect(() => {
    if (!needsScrollbar) return;

    let prevOffset = store.scrollOffset;

    const dispose = effect(() => {
      const currentOffset = store.scrollOffset;

      // Only trigger visibility when offset actually changes
      if (currentOffset !== prevOffset) {
        prevOffset = currentOffset;

        setIsVisible(true);

        // Clear existing timeout
        if (fadeTimeoutRef.current) {
          clearTimeout(fadeTimeoutRef.current);
        }

        // Set new fade timeout (use ref to avoid stale closure)
        fadeTimeoutRef.current = setTimeout(() => {
          if (!isDraggingRef.current) {
            setIsVisible(false);
          }
        }, FADE_DELAY);
      }
    });

    return () => {
      dispose();
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, [needsScrollbar, store]);

  // Reactive thumb positioning via effect()
  useEffect(() => {
    const dispose = effect(() => {
      const total = computed.totalWidth;
      const container = store.containerWidth;
      const offset = store.scrollOffset;
      const maxOffset = computed.maxScrollOffset;

      const thumbEl = thumbRef.current;
      if (!thumbEl) return;

      // Thumb width is proportional to visible area
      const thumbWidthPercent = Math.max(10, (container / total) * 100);

      // Thumb position
      const thumbPositionPercent =
        maxOffset > 0 ? (offset / maxOffset) * (100 - thumbWidthPercent) : 0;

      thumbEl.style.width = `${thumbWidthPercent}%`;
      thumbEl.style.left = `${thumbPositionPercent}%`;
    });

    return dispose;
  }, [store, computed]);

  // Handle track click - jump to position
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const maxOffset = maxScrollOffset;
    const newOffset = clickRatio * maxOffset;

    store.setScrollOffset(newOffset);
  };

  // Handle thumb drag with RAF throttling
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isDraggingRef.current = true;
    setIsDragging(true);
    const startX = e.clientX;
    const startOffset = store.scrollOffset;
    const maxOffset = maxScrollOffset;
    const trackWidth = trackRef.current?.clientWidth ?? 1;

    let pendingOffset: number | null = null;
    let rafId: number | null = null;

    const applyPendingOffset = () => {
      rafId = null;
      if (pendingOffset !== null) {
        store.setScrollOffset(pendingOffset);
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
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Apply final offset immediately
      if (pendingOffset !== null) {
        store.setScrollOffset(pendingOffset);
      }

      // Start fade timer
      fadeTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, FADE_DELAY);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

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
      <div
        ref={thumbRef}
        className="absolute top-0 h-full cursor-grab rounded-full bg-muted-foreground/50 transition-colors hover:bg-muted-foreground/70 active:cursor-grabbing active:bg-muted-foreground/80"
        onMouseDown={handleThumbMouseDown}
      />
    </div>
  );
}

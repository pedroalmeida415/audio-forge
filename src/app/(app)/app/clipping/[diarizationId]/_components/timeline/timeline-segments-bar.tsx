"use client";

import { observe } from "@legendapp/state";
import { useEffect, useRef, useState } from "react";
import { withAlpha } from "~/lib/speaker-colors";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";

const OVERSCAN_TIME = 20; // seconds of overscan

/**
 * Segments bar with true virtualization.
 *
 * - DOM elements created/removed directly based on visibility
 * - Click handlers attached to segment buttons
 * - Styling updated reactively for active/dimmed states
 */
export function TimelineSegmentsBar() {
  const $store = useClippingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentElementsMap = useRef<Map<string, HTMLButtonElement>>(new Map());
  const segmentsDataRef = useRef<DiarizationSegment[]>([]);

  const [isReady, setIsReady] = useState(false);

  // Store segments data once loaded
  useEffect(() => {
    const dispose = observe(() => {
      const segments = $store.segments.get();
      const filtered = segments.filter((s) => !s.isDeleted);
      segmentsDataRef.current = filtered;

      if (filtered.length > 0) {
        setIsReady(true);
      }
    });

    return dispose;
  }, [$store]);

  // Manage DOM elements directly based on visibility
  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    const container = containerRef.current;

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerWidth = $store.timeline.containerWidth.get();
      const activeSegmentId = $store.activeSegmentId.get();
      const selectedSpeaker = $store.selectedSpeaker.get();

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps - OVERSCAN_TIME;
      const visibleEndTime =
        (scrollOffset + containerWidth) / pps + OVERSCAN_TIME;

      // Build set of segment IDs that should be visible
      const visibleIds = new Set<string>();
      for (const segment of segmentsDataRef.current) {
        const { id, start, end } = segment;
        if (end >= visibleStartTime && start <= visibleEndTime) {
          visibleIds.add(id);
        }
      }

      // Remove segments that are no longer visible
      segmentElementsMap.current.forEach((el, id) => {
        if (!visibleIds.has(id)) {
          el.remove();
          segmentElementsMap.current.delete(id);
        }
      });

      // Add/update segments for visible IDs
      for (const segment of segmentsDataRef.current) {
        const { id, speaker, start, end } = segment;
        if (!visibleIds.has(id)) continue;

        // Get speaker color
        const color = $store.speakerColors[speaker]?.get();
        const collectionName =
          $store.speakerCollections[speaker]?.collectionName.get() ?? speaker;

        // Determine states
        const isActive = id === activeSegmentId;
        const isDimmed =
          selectedSpeaker !== null && speaker !== selectedSpeaker;

        // Calculate position and size
        const x = start * pps - scrollOffset;
        const width = Math.max((end - start) * pps, 4);

        // Create element if it doesn't exist
        let el = segmentElementsMap.current.get(id);
        if (!el) {
          el = createSegmentElement(id, collectionName, () => {
            $store.setActiveSegment(id);
          });
          container.appendChild(el);
          segmentElementsMap.current.set(id, el);
        }

        // Update position
        el.style.transform = `translateX(${x}px)`;
        el.style.width = `${width}px`;

        // Update styling based on states
        updateSegmentStyles(el, isActive, isDimmed, color);
      }
    });

    return () => {
      dispose();
      // Clean up all segment elements
      for (const el of segmentElementsMap.current.values()) {
        el.remove();
      }
      segmentElementsMap.current.clear();
    };
  }, [isReady, $store]);

  return (
    <div
      ref={containerRef}
      data-timeline-segments-bar
      className="relative h-8 shrink-0 overflow-hidden"
    />
  );
}

/**
 * Create a segment button element.
 */
function createSegmentElement(
  id: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.segmentId = id;
  el.className =
    "absolute left-0 top-1 h-6 overflow-hidden rounded border text-left transition-[opacity,filter]";
  el.style.willChange = "transform, width";
  el.onclick = onClick;

  // Label span
  const span = document.createElement("span");
  span.className = "block truncate px-2 font-mono text-[10px] leading-6";
  span.textContent = label;
  el.appendChild(span);

  return el;
}

/**
 * Update segment element styling based on active/dimmed states.
 */
function updateSegmentStyles(
  el: HTMLButtonElement,
  isActive: boolean,
  isDimmed: boolean,
  color: string | undefined,
): void {
  const span = el.firstElementChild as HTMLSpanElement | null;

  // Base classes
  let className =
    "absolute left-0 top-1 h-6 overflow-hidden rounded border text-left transition-[opacity,filter]";

  if (isActive) {
    className +=
      " z-10 ring-2 ring-primary ring-offset-1 ring-offset-background";
  } else {
    className += " hover:brightness-110";
  }

  if (isDimmed) {
    className += " opacity-25 grayscale";
  }

  el.className = className;

  // Colors
  if (isDimmed) {
    el.style.backgroundColor = "rgba(100, 100, 100, 0.3)";
    el.style.borderColor = "rgba(100, 100, 100, 0.5)";
    if (span) span.style.color = "rgba(150, 150, 150, 0.7)";
  } else {
    el.style.backgroundColor = color ? withAlpha(color, 0.4) : "";
    el.style.borderColor = color ?? "";
    if (span) span.style.color = color ?? "";
  }
}

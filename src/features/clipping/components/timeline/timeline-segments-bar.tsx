"use client";

import { observe } from "@legendapp/state";
import { useEffect, useRef, useState } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";
import {
  getSpeakerColor,
  getSpeakerName,
} from "~/features/clipping/utils/segment-utils";
import { withAlpha } from "~/lib/speaker-colors";
import type { DataSource, SegmentWithSource } from "~/server/db/schema";

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
  const segmentsDataRef = useRef<SegmentWithSource[]>([]);

  const [isReady, setIsReady] = useState(false);

  // Store segments data once loaded
  useEffect(() => {
    const dispose = observe(() => {
      const segments = $store.segments.get();
      segmentsDataRef.current = segments;

      if (segments.length > 0) {
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
      const selectedSpeakerId = $store.selectedSpeakerId.get();
      const speakers = $store.speakers.get();

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps - OVERSCAN_TIME;
      const visibleEndTime =
        (scrollOffset + containerWidth) / pps + OVERSCAN_TIME;

      // Build set of segment IDs that should be visible
      const visibleIds = new Set<string>();
      for (const segment of segmentsDataRef.current) {
        const { id, startTime, endTime } = segment;
        if (endTime >= visibleStartTime && startTime <= visibleEndTime) {
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
        const { id, speakerId, startTime, endTime, source } = segment;
        if (!visibleIds.has(id)) continue;

        // Get speaker color and name
        const color = getSpeakerColor(speakerId, speakers);
        const name = getSpeakerName(speakerId, speakers);

        // Determine states
        const isActive = id === activeSegmentId;
        const isDimmed =
          selectedSpeakerId !== null && speakerId !== selectedSpeakerId;

        // Calculate position and size
        const x = startTime * pps - scrollOffset;
        const width = Math.max((endTime - startTime) * pps, 4);

        // Create element if it doesn't exist
        let el = segmentElementsMap.current.get(id);
        if (!el) {
          el = createSegmentElement(id, name, () => {
            $store.setActiveSegment(id);
          });
          container.appendChild(el);
          segmentElementsMap.current.set(id, el);
        }

        // Update position
        el.style.transform = `translateX(${x}px)`;
        el.style.width = `${width}px`;

        // Update name text (speaker name may change)
        const span = el.firstElementChild as HTMLSpanElement | null;
        if (span && span.textContent !== name) {
          span.textContent = name;
        }

        // Update styling based on states and source
        updateSegmentStyles(el, isActive, isDimmed, color, source);
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
  el.dataset.testid = "segment-button";
  el.setAttribute("aria-label", `Segment: ${label}`);
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
 * Update segment element styling based on active/dimmed states and source.
 * Local segments get a dashed border to distinguish them from project segments.
 */
function updateSegmentStyles(
  el: HTMLButtonElement,
  isActive: boolean,
  isDimmed: boolean,
  color: string | undefined,
  source: DataSource,
): void {
  const span = el.firstElementChild as HTMLSpanElement | null;
  const isLocal = source === "local";

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

  // Border style based on source (dashed for local segments)
  el.style.borderStyle = isLocal ? "dashed" : "solid";

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

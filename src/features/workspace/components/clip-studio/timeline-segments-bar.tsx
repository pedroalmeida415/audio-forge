"use client";

import { useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { workspaceParams } from "~/features/workspace/search-params";
import {
  getSpeakerColor,
  getSpeakerName,
} from "~/features/workspace/utils/segment-utils";
import { withAlpha } from "~/lib/speaker-colors";
import type { Speaker } from "~/server/db/schema";

const OVERSCAN_TIME = 20; // seconds of overscan

interface TimelineSegmentsBarProps {
  segments: {
    id: string;
    speakerId: string;
    startTime: number;
    endTime: number;
  }[];
  speakers: Speaker[];
  speakerId: string | null;
  activeSegmentId: string | null;
}

/**
 * Segments bar with true virtualization.
 *
 * - DOM elements created/removed directly based on visibility
 * - Click handlers attached to segment buttons
 * - Styling updated reactively for active/dimmed states
 */
export function TimelineSegmentsBar({
  segments,
  speakers,
  speakerId,
  activeSegmentId,
}: TimelineSegmentsBarProps) {
  const { store, computed } = useWorkspaceStore();
  const [, setQueryState] = useQueryStates({
    speakerId: workspaceParams.speakerId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentElementsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Manage DOM elements directly based on visibility
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const dispose = effect(() => {
      const scrollOffset = store.scrollOffset;
      const pps = computed.pixelsPerSecond;
      const containerWidth = store.containerWidth;

      // Calculate visible time range
      const visibleStartTime = scrollOffset / pps - OVERSCAN_TIME;
      const visibleEndTime =
        (scrollOffset + containerWidth) / pps + OVERSCAN_TIME;

      // Build set of segment IDs that should be visible
      const visibleIds = new Set<string>();
      for (const segment of segments) {
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
      for (const segment of segments) {
        const { id, startTime, endTime } = segment;
        const segSpeakerId = segment.speakerId;
        if (!visibleIds.has(id)) continue;

        // Get speaker color and name
        const color = getSpeakerColor(segSpeakerId, speakers);
        const name = getSpeakerName(segSpeakerId, speakers);

        // Determine states
        const isActive = id === activeSegmentId;
        const isDimmed = speakerId !== null && segSpeakerId !== speakerId;

        // Calculate position and size
        const x = startTime * pps - scrollOffset;
        const width = Math.max((endTime - startTime) * pps, 4);

        // Create element if it doesn't exist
        let el = segmentElementsMap.current.get(id);
        if (!el) {
          el = createSegmentElement(id, name, () => {
            void setQueryState({
              speakerId: segSpeakerId,
              activeSegmentId: id,
            });
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
  }, [
    store,
    computed,
    segments,
    speakers,
    speakerId,
    activeSegmentId,
    setQueryState,
  ]);

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

  // Always solid border
  el.style.borderStyle = "solid";

  // Colors
  if (isDimmed) {
    el.style.backgroundColor = "hsl(var(--muted))";
    el.style.borderColor = "hsl(var(--border))";
    if (span) span.style.color = "hsl(var(--muted-foreground))";
  } else {
    el.style.backgroundColor = color ? withAlpha(color, 0.4) : "";
    el.style.borderColor = color ?? "";
    if (span) span.style.color = color ?? "";
  }
}

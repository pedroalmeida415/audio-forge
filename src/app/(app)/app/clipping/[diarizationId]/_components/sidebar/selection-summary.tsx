"use client";

import { useValue } from "@legendapp/state/react";
import { formatDuration } from "~/lib/time-utils";
import type { DiarizationSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";
import { getSelectedSegmentsData } from "../../_utils/segment-utils";

export function SelectionSummary() {
  const $store = useClippingStore();

  const selectedSegmentIds = useValue($store.selection.selectedSegmentIds);

  // Track segments with useValue selector to react to segment changes
  const segmentsById = useValue(() => {
    const segments = $store.segments.get();
    return segments.reduce(
      (acc, segment) => {
        acc[segment.id] = segment;
        return acc;
      },
      {} as Record<string, DiarizationSegment>,
    );
  });

  const selectionData = getSelectedSegmentsData(
    segmentsById,
    selectedSegmentIds,
  );

  if (selectedSegmentIds.size === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 font-medium text-primary text-sm">
        {selectedSegmentIds.size} segment{selectedSegmentIds.size !== 1 && "s"}{" "}
        selected
      </div>
      <div className="flex gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">
            Total Duration
          </span>
          <span className="font-mono text-xs">
            {formatDuration(selectionData.totalDuration)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Avg Length</span>
          <span className="font-mono text-xs">
            {formatDuration(selectionData.avgLength)}
          </span>
        </div>
      </div>
    </div>
  );
}

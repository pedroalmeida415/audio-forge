"use client";

import { useValue } from "@legendapp/state/react";
import { useClippingStore } from "../../_context/store.context";
import {
  calculateStats,
  getDurationDistribution,
} from "../../_utils/segment-utils";

export function StatsSection() {
  const $store = useClippingStore();

  const allSegments = useValue($store.segments);
  const selectedSpeaker = useValue($store.selectedSpeaker);

  let segments = allSegments;
  if (selectedSpeaker) {
    segments = segments.filter((s) => s.speaker === selectedSpeaker);
  }
  const stats = calculateStats(segments);
  const distribution = getDurationDistribution(segments);

  const maxDistribution = Math.max(...distribution, 1);
  const reviewedPercent =
    stats.segmentCount > 0
      ? Math.round((stats.reviewedCount / stats.segmentCount) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Stats
      </h3>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted/50 p-2.5">
          <div className="text-muted-foreground text-xs">Segments</div>
          <div className="font-semibold text-xl">{stats.segmentCount}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5">
          <div className="flex items-start justify-between gap-1 text-muted-foreground text-xs">
            Reviewed
            <span className="font-normal text-muted-foreground">
              ({reviewedPercent}%)
            </span>
          </div>
          <div className="font-semibold text-xl">{stats.reviewedCount} </div>
        </div>
      </div>

      {/* Duration distribution chart */}
      <div>
        <div className="mb-2 text-muted-foreground text-xs">
          Duration Distribution
        </div>
        <div className="flex h-8 items-end gap-0.5">
          {distribution.map((count, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-t bg-primary/60 transition-all hover:bg-primary"
              style={{
                height: `${(count / maxDistribution) * 100}%`,
                minHeight: count > 0 ? "2px" : "0",
              }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between">
          <span className="font-mono text-muted-foreground text-xs">0.5s</span>
          <span className="font-mono text-muted-foreground text-xs">30s+</span>
        </div>
      </div>
    </div>
  );
}

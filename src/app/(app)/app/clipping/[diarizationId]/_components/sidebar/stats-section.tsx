"use client";

import { useMemo } from "react";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import {
  calculateStats,
  getDurationDistribution,
} from "../../_utils/segment-utils";

export function StatsSection() {
  const segmentsById = useClippingWorkspaceStore((s) => s.segmentsById);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);

  const stats = useMemo(() => {
    let segments = Object.values(segmentsById);
    if (selectedSpeaker) {
      segments = segments.filter((s) => s.speaker === selectedSpeaker);
    }
    return calculateStats(segments);
  }, [segmentsById, selectedSpeaker]);

  const distribution = useMemo(() => {
    let segments = Object.values(segmentsById);
    if (selectedSpeaker) {
      segments = segments.filter((s) => s.speaker === selectedSpeaker);
    }
    return getDurationDistribution(segments);
  }, [segmentsById, selectedSpeaker]);

  const maxDistribution = Math.max(...distribution, 1);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Stats
      </h3>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted/50 p-2.5">
          <div className="text-[10px] text-muted-foreground">Speakers</div>
          <div className="font-semibold text-xl">{stats.speakerCount}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5">
          <div className="text-[10px] text-muted-foreground">Segments</div>
          <div className="font-semibold text-xl">{stats.segmentCount}</div>
        </div>
      </div>

      {/* Duration distribution chart */}
      <div>
        <div className="mb-2 text-[10px] text-muted-foreground">
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
          <span className="font-mono text-[10px] text-muted-foreground">
            0.5s
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            30s+
          </span>
        </div>
      </div>
    </div>
  );
}

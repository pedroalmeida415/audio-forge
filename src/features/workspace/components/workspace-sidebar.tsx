"use client";

import { DurationHistogram } from "~/features/workspace/components/duration-histogram";

const MOCK_STATS = {
  totalSegments: 12470,
  totalProcessed: 892,
  totalTranscribed: 756,
  avgQuality: 3.82,
  totalDuration: 4523,
};

const MOCK_DURATION_BUCKETS = [
  { range: "0-2s", count: 234 },
  { range: "2-4s", count: 456 },
  { range: "4-6s", count: 321 },
  { range: "6-8s", count: 156 },
  { range: "8-10s", count: 80 },
  { range: "10-12s", count: 45 },
  { range: "12-14s", count: 28 },
  { range: "14-16s", count: 15 },
  { range: "16s+", count: 8 },
];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function WorkspaceSidebar() {
  const stats = MOCK_STATS;

  return (
    <aside className="sticky top-14 h-[calc(100vh-6rem)] w-60 shrink-0 overflow-y-auto border-border border-l bg-background p-4">
      <div className="flex h-full flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div>
            <div className="text-muted-foreground text-xs"># of Segments</div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums">
              {stats.totalSegments}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs"># of Clips</div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums">
              {stats.totalProcessed}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs"># Transcribed</div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums">
              {stats.totalTranscribed}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">
              Avg. Clip Quality
            </div>
            <div className="font-bold font-mono text-5xl text-primary tabular-nums">
              {stats.avgQuality.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <div>
            <div className="text-muted-foreground text-xs">Total Duration</div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums">
              {formatDuration(stats.totalDuration)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">
              Duration Distribution
            </div>
            <DurationHistogram buckets={MOCK_DURATION_BUCKETS} />
          </div>
        </div>
      </div>
    </aside>
  );
}

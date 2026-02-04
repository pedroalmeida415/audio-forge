"use client";

import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { DurationHistogram } from "./duration-histogram";

// Mock data for demonstration
const MOCK_STATS = {
  totalSegments: 1247,
  totalProcessed: 892,
  totalTranscribed: 756,
  avgQuality: 3.82,
  totalDuration: 4523, // seconds
};

// Mock duration distribution data
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

export function SpeakerSidebar() {
  const { speakerId } = useParams<{ speakerId: string }>();

  // Fetch stats (using mock data for now)
  const { data: _stats } = api.speaker.getStats.useQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  // Use mock data for now
  const stats = MOCK_STATS;

  return (
    <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-border border-l bg-background p-4">
      <div className="flex h-full flex-col gap-6">
        {/* Big stat metrics */}
        <div className="flex flex-col gap-6">
          <BigStat label="Total Segments" value={stats.totalSegments} />
          <BigStat label="Processed" value={stats.totalProcessed} />
          <BigStat label="Transcribed" value={stats.totalTranscribed} />
          <BigStat
            label="Avg. Quality"
            value={stats.avgQuality.toFixed(2)}
            highlight
          />
          <BigStat
            label="Total Duration"
            value={formatDuration(stats.totalDuration)}
          />
        </div>

        {/* Duration Distribution */}
        <div className="mt-auto flex flex-col gap-2">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Duration Distribution
          </span>
          <DurationHistogram buckets={MOCK_DURATION_BUCKETS} />
        </div>
      </div>
    </aside>
  );
}

function BigStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`font-bold font-mono text-5xl tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

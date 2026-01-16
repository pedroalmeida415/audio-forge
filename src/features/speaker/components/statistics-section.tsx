"use client";

import { useSelector } from "@legendapp/state/react";
import { useSpeakerStore } from "../context/store-context";
import type { HistogramData } from "../store/speaker-store";

// ============================================================================
// Histogram Chart Component
// ============================================================================

interface HistogramChartProps {
  data: HistogramData;
  title: string;
  emptyMessage?: string;
}

/**
 * Simple bar chart for histogram visualization.
 * Each bar's height is proportional to its count relative to the max count.
 */
function HistogramChart({
  data,
  title,
  emptyMessage = "No data",
}: HistogramChartProps) {
  const { buckets } = data;

  // Find max count for scaling
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-muted-foreground text-xs">
          {title}
        </span>
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed bg-muted/30">
          <span className="text-muted-foreground text-xs">{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-muted-foreground text-xs">{title}</span>
      <div className="flex h-24 items-end gap-0.5">
        {buckets.map((bucket, index) => {
          const heightPercent = (bucket.count / maxCount) * 100;
          return (
            <div
              key={index}
              className="group relative flex-1"
              title={`${bucket.label}: ${bucket.count}`}
            >
              <div
                className="w-full rounded-t-sm bg-primary/60 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(heightPercent, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels - show first, middle, and last */}
      <div className="flex justify-between text-muted-foreground text-[10px]">
        <span>{buckets[0]?.label.split("-")[0] ?? ""}</span>
        <span>{buckets[buckets.length - 1]?.label.split("-")[1] ?? ""}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
}

function StatCard({ label, value, suffix }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-lg tabular-nums">{value}</span>
        {suffix && (
          <span className="text-muted-foreground text-xs">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Duration Formatter
// ============================================================================

/**
 * Format duration in seconds as hours:minutes:seconds
 */
function formatTotalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Statistics Section Component
// ============================================================================

/**
 * Statistics section for speaker sidebar.
 *
 * Displays:
 * - Total segments count
 * - Total duration (formatted as hh:mm:ss)
 * - Average MOS score (if available)
 * - Transcription coverage percentage
 * - MOS distribution histogram
 * - Duration distribution histogram
 */
export function StatisticsSection() {
  const $store = useSpeakerStore();
  const statistics = useSelector(() => $store.statistics());

  const {
    totalSegments,
    totalDuration,
    averageMos,
    mosDistribution,
    durationDistribution,
    transcriptionCoverage,
  } = statistics;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-sm">Statistics</h2>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total Segments" value={totalSegments} />
        <StatCard label="Total Duration" value={formatTotalDuration(totalDuration)} />
        <StatCard
          label="Avg MOS"
          value={averageMos !== null ? averageMos.toFixed(2) : "-"}
        />
        <StatCard
          label="Transcription"
          value={transcriptionCoverage.toFixed(0)}
          suffix="%"
        />
      </div>

      {/* Histograms */}
      <div className="flex flex-col gap-4">
        <HistogramChart
          data={mosDistribution}
          title="MOS Distribution"
          emptyMessage="No MOS scores"
        />
        <HistogramChart
          data={durationDistribution}
          title="Duration Distribution"
          emptyMessage="No segments"
        />
      </div>
    </div>
  );
}

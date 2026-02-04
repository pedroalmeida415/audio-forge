"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";

interface DurationHistogramProps {
  segments: SegmentWithClip[];
  className?: string;
}

interface DurationBucket {
  range: string;
  count: number;
}

const DURATION_BUCKETS = [
  { range: "0-2s", min: 0, max: 2 },
  { range: "2-4s", min: 2, max: 4 },
  { range: "4-6s", min: 4, max: 6 },
  { range: "6-8s", min: 6, max: 8 },
  { range: "8s+", min: 8, max: Number.POSITIVE_INFINITY },
];

function computeBuckets(segments: SegmentWithClip[]): DurationBucket[] {
  const buckets = DURATION_BUCKETS.map((b) => ({ range: b.range, count: 0 }));

  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    const bucketIdx = DURATION_BUCKETS.findIndex(
      (b) => duration >= b.min && duration < b.max,
    );
    if (bucketIdx !== -1 && buckets[bucketIdx]) {
      buckets[bucketIdx].count++;
    }
  }

  return buckets;
}

const chartConfig = {
  count: {
    label: "Segments",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function DurationHistogram({
  segments,
  className,
}: DurationHistogramProps) {
  const data = computeBuckets(segments);

  // Don't render if no data
  if (segments.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className={className}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ left: 0, right: 8, top: 4, bottom: 4 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="range"
          type="category"
          tickLine={false}
          axisLine={false}
          width={36}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar
          dataKey="count"
          fill="var(--color-count)"
          radius={4}
          barSize={12}
        />
      </BarChart>
    </ChartContainer>
  );
}

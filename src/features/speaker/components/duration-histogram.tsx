"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

interface DurationBucket {
  range: string;
  count: number;
}

interface DurationHistogramProps {
  buckets: DurationBucket[];
  className?: string;
}

const chartConfig = {
  count: {
    label: "Segments",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function DurationHistogram({
  buckets,
  className,
}: DurationHistogramProps) {
  // Don't render if no data
  if (buckets.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className={className}>
      <BarChart data={buckets} margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
        <XAxis
          dataKey="range"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <YAxis type="number" hide />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar
          dataKey="count"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

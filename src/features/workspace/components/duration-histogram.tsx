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
}

const chartConfig = {
  count: {
    label: "Segments",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function DurationHistogram({ buckets }: DurationHistogramProps) {
  // Don't render if no data
  if (buckets.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full w-full text-muted-foreground [&_.recharts-surface]:overflow-visible"
    >
      <BarChart
        data={buckets}
        margin={{ left: 0, right: 0, top: 0, bottom: 10 }}
      >
        <XAxis
          dataKey="range"
          height={2}
          tickLine={false}
          axisLine={true}
          tick={{ fontSize: 12, fill: "currentColor" }}
          tickMargin={0}
          interval="preserveStartEnd"
        />
        <YAxis
          type="number"
          hide
          domain={[0, "dataMax"]}
          padding={{ top: 0, bottom: 0 }}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar
          dataKey="count"
          fill="var(--color-primary)"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

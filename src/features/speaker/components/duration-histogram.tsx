"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";

interface DurationHistogramProps {
  segments: SegmentWithClip[];
  className?: string;
}

interface DurationBucket {
  range: string;
  min: number;
  max: number;
  count: number;
}

const DURATION_BUCKETS: Omit<DurationBucket, "count">[] = [
  { range: "0-2s", min: 0, max: 2 },
  { range: "2-4s", min: 2, max: 4 },
  { range: "4-6s", min: 4, max: 6 },
  { range: "6-8s", min: 6, max: 8 },
  { range: "8s+", min: 8, max: Number.POSITIVE_INFINITY },
];

function computeBuckets(segments: SegmentWithClip[]): DurationBucket[] {
  const buckets = DURATION_BUCKETS.map((b) => ({ ...b, count: 0 }));

  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    const bucket = buckets.find((b) => duration >= b.min && duration < b.max);
    if (bucket) {
      bucket.count++;
    }
  }

  return buckets;
}

export function DurationHistogram({
  segments,
  className,
}: DurationHistogramProps) {
  const buckets = computeBuckets(segments);
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className={cn("flex items-end gap-2", className)}>
      {buckets.map((bucket) => (
        <Tooltip key={bucket.range}>
          <TooltipTrigger asChild>
            <div className="flex cursor-help flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-8 rounded transition-colors duration-200",
                  bucket.count > 0
                    ? "bg-primary/80 shadow-sm"
                    : "bg-muted-foreground/20",
                )}
                style={{
                  height: `${Math.max((bucket.count / maxCount) * 48, 4)}px`,
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {bucket.range}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {bucket.count} segment{bucket.count !== 1 ? "s" : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

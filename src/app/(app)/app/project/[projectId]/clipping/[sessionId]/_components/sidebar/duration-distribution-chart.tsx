"use client";

import { useValue } from "@legendapp/state/react";
import { useState } from "react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Duration distribution chart with dynamic bucketing.
 * Shows segment duration distribution with hover tooltips.
 */
export function DurationDistributionChart({
  speakerId,
}: {
  speakerId: string;
}) {
  const $store = useClippingStore();
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);

  const chartData = useValue(() => {
    const segments = $store.segments.get();
    const speakerSegments = segments
      .filter((s) => s.speakerId === speakerId && !s.isDeleted)
      .map((s) => s.end - s.start);

    if (speakerSegments.length === 0) {
      return null;
    }

    const minDuration = Math.min(...speakerSegments);
    const maxDuration = Math.max(...speakerSegments);
    const range = maxDuration - minDuration;

    // Fixed bucket count for stable layout
    const initialBucketCount = 9;
    const bucketSize = range / initialBucketCount || 1;
    const allBuckets: { min: number; max: number; count: number }[] = [];

    for (let i = 0; i < initialBucketCount; i++) {
      allBuckets.push({
        min: minDuration + i * bucketSize,
        max: minDuration + (i + 1) * bucketSize,
        count: 0,
      });
    }

    // Fill buckets
    for (const duration of speakerSegments) {
      const bucketIndex = Math.min(
        Math.floor((duration - minDuration) / bucketSize),
        initialBucketCount - 1,
      );
      const bucket = allBuckets[bucketIndex];
      if (bucket) bucket.count++;
    }

    return {
      buckets: allBuckets,
      total: speakerSegments.length,
      minDuration,
      maxDuration,
    };
  });

  if (!chartData) {
    return null;
  }

  const { buckets, total, minDuration, maxDuration } = chartData;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const hoveredData = hoveredBucket !== null ? buckets[hoveredBucket] : null;

  return (
    <div className="space-y-1">
      {/* Label */}
      <div className="text-[11px] text-muted-foreground">
        Length Distribution (in seconds)
      </div>

      {/* Bars */}
      <div className="flex h-10 items-end gap-0.5">
        {buckets.map((bucket, idx) => (
          <div
            key={`${bucket.min.toFixed(2)}-${bucket.max.toFixed(2)}`}
            className={`flex-1 rounded-t-sm transition-all ${
              bucket.count === 0
                ? "bg-muted-foreground/20"
                : hoveredBucket === idx
                  ? "bg-foreground"
                  : "bg-muted-foreground/60 hover:bg-muted-foreground"
            }`}
            style={{
              height:
                bucket.count > 0
                  ? `${(bucket.count / maxCount) * 100}%`
                  : "2px",
              minHeight: "2px",
            }}
            onMouseEnter={() => setHoveredBucket(idx)}
            onMouseLeave={() => setHoveredBucket(null)}
          />
        ))}
      </div>

      {/* Bottom labels - show hover info or range */}
      <div className="flex justify-between font-mono text-[10px]">
        {hoveredData ? (
          <>
            <span className="text-muted-foreground">
              {hoveredData.min.toFixed(2)}→{hoveredData.max.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              {((hoveredData.count / total) * 100).toFixed(1)}%
            </span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              {minDuration.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              {maxDuration.toFixed(2)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

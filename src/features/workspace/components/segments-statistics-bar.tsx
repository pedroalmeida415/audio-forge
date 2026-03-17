"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { DurationHistogram } from "~/features/workspace/components/duration-histogram";
import { formatDuration } from "~/lib/time-utils";
import { api } from "~/trpc/react";
import { workspaceParams } from "../search-params";

export function SegmentsStatisticsBar() {
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const { data, isLoading } = api.segment.getBySpeaker.useQuery(
    { speakerId: speakerId ?? "" },
    { enabled: !!speakerId && !sourceId },
  );

  const stats = useMemo(() => {
    if (!data?.segments) return null;

    let totalSegments = 0;
    let totalProcessed = 0;
    let totalTranscribed = 0;
    let totalQuality = 0;
    let qualityCount = 0;
    let totalDuration = 0;

    let minDuration = Number.POSITIVE_INFINITY;
    let maxDuration = Number.NEGATIVE_INFINITY;

    for (const segment of data.segments) {
      totalSegments++;

      const duration = segment.endTime - segment.startTime;
      totalDuration += duration;
      minDuration = Math.min(minDuration, duration);
      maxDuration = Math.max(maxDuration, duration);

      if (segment.transcription) {
        totalTranscribed++;
      }

      if (segment.clip) {
        totalProcessed++;

        const scores = segment.clip.scores as {
          DNSMOS?: { OVRL?: number };
        } | null;

        if (scores?.DNSMOS?.OVRL !== undefined) {
          totalQuality += scores.DNSMOS.OVRL;
          qualityCount++;
        }
      }
    }

    const BUCKET_COUNT = 9;
    if (minDuration === Number.POSITIVE_INFINITY) {
      minDuration = 0;
      maxDuration = 18;
    } else if (minDuration === maxDuration) {
      if (minDuration === 0) {
        maxDuration = 18;
      } else {
        const padding = Math.max(2, minDuration * 0.2);
        minDuration = Math.max(0, minDuration - padding);
        maxDuration = minDuration + padding * 2;
      }
    }

    const bucketSize = (maxDuration - minDuration) / BUCKET_COUNT;
    const durationCounts = new Array(BUCKET_COUNT).fill(0);

    for (const segment of data.segments) {
      const duration = segment.endTime - segment.startTime;
      const bucketIndex = Math.floor((duration - minDuration) / bucketSize);
      const clampedIndex = Math.max(0, Math.min(bucketIndex, BUCKET_COUNT - 1));
      durationCounts[clampedIndex]++;
    }

    const format = (n: number) => Math.round(n).toString();

    const buckets = Array.from({ length: BUCKET_COUNT }).map((_, i) => {
      const start = minDuration + i * bucketSize;
      const end = start + bucketSize;
      const isLast = i === BUCKET_COUNT - 1;

      let range = "";
      if (isLast) {
        range = `${format(start)}s+`;
      } else {
        const startStr = format(start);
        const endStr = format(end);
        range = startStr === endStr ? `${startStr}s` : `${startStr}-${endStr}s`;
      }

      return {
        range,
        count: durationCounts[i] ?? 0,
      };
    });

    return {
      totalSegments,
      totalProcessed,
      totalTranscribed,
      avgQuality: qualityCount > 0 ? totalQuality / qualityCount : 0,
      totalDuration,
      buckets,
    };
  }, [data?.segments]);

  if (!speakerId || sourceId) {
    return null;
  }

  if (isLoading || !stats) {
    return (
      <aside className="flex h-16 shrink-0 items-center justify-center border-border border-t bg-background px-4">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </aside>
    );
  }

  return (
    <aside className="sticky bottom-10 z-10 shrink-0 border-border border-t bg-background px-6 pt-3 pb-2 leading-none shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="flex items-stretch gap-12">
        <div className="flex flex-1 items-stretch justify-start gap-10">
          <div className="flex flex-col gap-2">
            <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
              Total Segments
            </div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums leading-none">
              {stats.totalSegments}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
              With Clips
            </div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums leading-none">
              {stats.totalProcessed}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
              Transcribed
            </div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums leading-none">
              {stats.totalTranscribed}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
            Avg Quality
          </div>
          <div className="font-bold font-mono text-5xl text-primary tabular-nums leading-none">
            {stats.avgQuality.toFixed(2)}
          </div>
        </div>

        <div className="flex flex-1 items-stretch justify-end gap-10">
          <div className="flex flex-col gap-2">
            <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
              Total Duration
            </div>
            <div className="font-bold font-mono text-5xl text-foreground tabular-nums leading-none">
              {formatDuration(stats.totalDuration)}
            </div>
          </div>
          <div className="flex w-48 flex-col gap-2">
            <div className="whitespace-nowrap font-medium text-[10px] text-muted-foreground uppercase leading-none tracking-wider">
              Clip Length Distribution
            </div>
            <div className="flex-1">
              <DurationHistogram buckets={stats.buckets} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

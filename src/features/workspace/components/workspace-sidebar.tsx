"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { DurationHistogram } from "~/features/workspace/components/duration-histogram";
import { api } from "~/trpc/react";
import { formatDuration } from "~/lib/time-utils";
import { workspaceParams } from "../search-params";

export function WorkspaceSidebar() {
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
      <aside className="sticky top-14 flex h-[calc(100vh-6rem)] w-60 shrink-0 items-center justify-center overflow-y-auto border-border border-l bg-background p-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </aside>
    );
  }

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
            <DurationHistogram buckets={stats.buckets} />
          </div>
        </div>
      </div>
    </aside>
  );
}

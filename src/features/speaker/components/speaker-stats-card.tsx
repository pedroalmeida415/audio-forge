"use client";

import { Clock, FileAudio, MessageSquare, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { api } from "~/trpc/react";
import { DurationHistogram } from "./duration-histogram";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function SpeakerStatsCard() {
  const { speakerId } = useParams<{ speakerId: string }>();

  // Fetch stats directly (stub with mocked values for now)
  const { data: stats } = api.speaker.getStats.useQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-medium text-sm">
          Speaker Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatRow
          icon={<FileAudio className="size-4" />}
          label="Total Segments"
          value={stats?.totalSegments.toString() ?? "--"}
        />
        <StatRow
          icon={<Clock className="size-4" />}
          label="Total Duration"
          value={stats ? formatDuration(stats.totalDuration) : "--"}
        />
        <StatRow
          icon={<Sparkles className="size-4" />}
          label="Processed Clips"
          value={stats?.clipsCount.toString() ?? "--"}
        />
        <StatRow
          icon={<MessageSquare className="size-4" />}
          label="Transcribed"
          value={stats?.transcribedCount.toString() ?? "--"}
        />
        <StatRow
          icon={<Sparkles className="size-4" />}
          label="Avg Quality"
          value={stats?.avgScore != null ? stats.avgScore.toFixed(2) : "--"}
          highlight
        />

        <Separator className="my-4" />

        {/* Duration Distribution - TODO: needs segment data */}
        <div className="space-y-3">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Duration Distribution
          </span>
          <DurationHistogram segments={[]} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-secondary-foreground text-sm">
        {icon}
        {label}
      </div>
      <span
        className={`font-mono font-semibold text-sm ${highlight ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

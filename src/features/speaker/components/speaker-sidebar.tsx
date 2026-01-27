"use client";

import { useValue } from "@legendapp/state/react";
import {
  Clock,
  FileAudio,
  Loader2,
  MessageSquare,
  Scissors,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { DurationHistogram } from "./duration-histogram";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function SpeakerSidebar() {
  const $store = useSpeakerPageStore();
  const stats = useValue($store.stats);
  const segments = useValue($store.segments);
  const selectedIds = useValue($store.selectedSegmentIds);

  const hasSelection = selectedIds.size > 0;

  const [processingOperation, setProcessingOperation] = useState<string | null>(
    null,
  );

  const queueMutation = api.segment.queueProcessing.useMutation({
    onMutate: (variables) => {
      $store.markSegmentsPending(variables.segmentIds);
    },
    onSuccess: (data) => {
      console.log("Queued:", data.jobIds.length, "jobs");
      setProcessingOperation(null);
      $store.clearSelection();
    },
    onError: (_error, variables) => {
      for (const id of variables.segmentIds) {
        $store.markSegmentComplete(id);
      }
      setProcessingOperation(null);
    },
  });

  const handleProcess = (
    operation: "denoise" | "remove_overlap" | "transcribe",
  ) => {
    if (!hasSelection) return;
    setProcessingOperation(operation);
    queueMutation.mutate({
      segmentIds: Array.from(selectedIds),
      operation,
    });
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5">
      {/* Speaker Stats */}
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
            value={stats.totalSegments.toString()}
          />
          <StatRow
            icon={<Clock className="size-4" />}
            label="Total Duration"
            value={formatDuration(stats.totalDuration)}
          />
          <StatRow
            icon={<Sparkles className="size-4" />}
            label="Processed Clips"
            value={stats.clipsCount.toString()}
          />
          <StatRow
            icon={<MessageSquare className="size-4" />}
            label="Transcribed"
            value={stats.transcribedCount.toString()}
          />
          <StatRow
            icon={<Sparkles className="size-4" />}
            label="Avg Quality"
            value={stats.avgScore !== null ? stats.avgScore.toFixed(2) : "--"}
            highlight
          />

          <Separator className="my-4" />

          {/* Duration Distribution */}
          <div className="space-y-3">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Duration Distribution
            </span>
            <DurationHistogram segments={segments} />
          </div>
        </CardContent>
      </Card>

      {/* Processing Operations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">
            Processing Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            onClick={() => handleProcess("denoise")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "denoise" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Volume2 className="size-4" />
            )}
            Denoise
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleProcess("remove_overlap")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "remove_overlap" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Scissors className="size-4" />
            )}
            Remove Overlap
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleProcess("transcribe")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "transcribe" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            Transcribe
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>

          {!hasSelection && (
            <p className="mt-4 text-muted-foreground text-xs">
              Select segments to enable processing operations
            </p>
          )}
        </CardContent>
      </Card>
    </aside>
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

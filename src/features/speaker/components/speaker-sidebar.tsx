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
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function SpeakerSidebar() {
  const $store = useSpeakerPageStore();
  const stats = useValue($store.stats);
  const selectedIds = useValue($store.selectedSegmentIds);

  const hasSelection = selectedIds.size > 0;

  const [processingOperation, setProcessingOperation] = useState<string | null>(
    null,
  );

  const queueMutation = api.segment.queueProcessing.useMutation({
    onSuccess: (data) => {
      // Show success feedback (could integrate with toast)
      console.log("Queued:", data.message);
      setProcessingOperation(null);
    },
    onError: () => {
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
      operations: [operation],
    });
  };

  return (
    <div className="flex w-72 flex-col gap-4">
      {/* Stats Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      {/* Processing Actions Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">Processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProcess("denoise")}
            disabled={!hasSelection || queueMutation.isPending}
            className="w-full justify-start"
          >
            {processingOperation === "denoise" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
            Denoise
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProcess("remove_overlap")}
            disabled={!hasSelection || queueMutation.isPending}
            className="w-full justify-start"
          >
            {processingOperation === "remove_overlap" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Scissors className="size-3.5" />
            )}
            Remove Overlap
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProcess("transcribe")}
            disabled={!hasSelection || queueMutation.isPending}
            className="w-full justify-start"
          >
            {processingOperation === "transcribe" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MessageSquare className="size-3.5" />
            )}
            Transcribe
          </Button>
          {!hasSelection && (
            <p className="mt-2 text-muted-foreground text-xs">
              Select segments to enable processing actions
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-medium text-sm tabular-nums">{value}</span>
    </div>
  );
}

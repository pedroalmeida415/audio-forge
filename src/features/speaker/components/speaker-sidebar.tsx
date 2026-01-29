"use client";

import { useValue } from "@legendapp/state/react";
import { Loader2, MessageSquare, Scissors, Volume2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { SpeakerStatsCard } from "./speaker-stats-card";

export function SpeakerSidebar() {
  const $store = useSpeakerPageStore();
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
      <SpeakerStatsCard />

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

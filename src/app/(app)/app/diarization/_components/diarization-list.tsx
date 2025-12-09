"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  Clock,
  Loader2,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export function DiarizationList() {
  const [diarizationsList] = api.diarization.list.useSuspenseQuery(undefined, {
    refetchInterval: 10000, // Poll every 10 seconds for status updates
  });

  const utils = api.useUtils();
  const deleteMutation = api.diarization.delete.useMutation({
    onSuccess: () => {
      utils.diarization.list.invalidate();
    },
  });

  if (!diarizationsList?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <Users className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="font-medium text-lg">No diarizations yet</p>
        <p className="text-muted-foreground text-sm">
          Upload an audio file to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display font-semibold text-xl">Your Diarizations</h2>
      <div className="grid gap-4">
        {diarizationsList.map((diarization, index) => {
          const isCompleted = !!diarization.completedAt;
          const isSucceeded =
            isCompleted && (diarization.output?.segments?.length ?? 0) > 0;
          const isFailed = isCompleted && !isSucceeded;
          const isProcessing = !isCompleted;

          return (
            <Card
              className={cn(
                "animate-fade-up opacity-0",
                isSucceeded && "border-green-500/20",
                isFailed && "border-red-500/20",
              )}
              key={diarization.id}
              style={{ animationDelay: `${0.05 * index}s` }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {diarization.file?.storageKey?.split("/").pop() ||
                        "Audio File"}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(diarization.createdAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      isFailed={isFailed}
                      isProcessing={isProcessing}
                      isSucceeded={isSucceeded}
                    />
                    <Button
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() =>
                        deleteMutation.mutate({ id: diarization.id })
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isSucceeded && diarization.output?.segments && (
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {getUniqueSpeakers(diarization.output.segments).map(
                      (speaker) => (
                        <Badge key={speaker} variant="secondary">
                          {speaker}
                        </Badge>
                      ),
                    )}
                  </div>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {diarization.output.segments.length} segments detected
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({
  isProcessing,
  isSucceeded,
  isFailed,
}: {
  isProcessing: boolean;
  isSucceeded: boolean;
  isFailed: boolean;
}) {
  if (isProcessing) {
    return (
      <Badge className="gap-1" variant="secondary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (isSucceeded) {
    return (
      <Badge className="gap-1 bg-green-500/10 text-green-500 hover:bg-green-500/20">
        <CheckCircle className="h-3 w-3" />
        Completed
      </Badge>
    );
  }
  if (isFailed) {
    return (
      <Badge className="gap-1" variant="destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return null;
}

function getUniqueSpeakers(segments: { speaker: string }[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))].sort();
}

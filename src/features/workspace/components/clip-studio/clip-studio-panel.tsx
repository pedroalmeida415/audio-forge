"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Skeleton } from "~/components/ui/skeleton";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";
import { TimelineContainer } from "./timeline-container";

export function ClipStudioPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);
  const [open, setOpen] = useState(false);

  const { store } = useWorkspaceStore();

  // Auto-open when sourceId is set
  useEffect(() => {
    if (sourceId) setOpen(true);
  }, [sourceId]);

  // Reset timeline state when source changes
  useEffect(() => {
    store.resetTimeline();
  }, [sourceId]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="sticky bottom-0 z-20 border-border border-t bg-background"
    >
      <div className="flex h-10 items-center justify-between px-4">
        <span className="font-medium text-sm">Clip Studio</span>

        <CollapsibleTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="bg-card">
        {sourceId ? (
          <ClipStudioTimelineInner
            key={sourceId}
            sourceId={sourceId}
            projectId={projectId}
            speakerId={speakerId}
          />
        ) : (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a source to view the timeline</p>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ClipStudioTimelineInner({
  sourceId,
  projectId,
  speakerId,
}: {
  sourceId: string;
  projectId: string;
  speakerId: string | null;
}) {
  const utils = api.useUtils();

  const {
    data: source,
    isLoading: isLoadingSource,
    error: sourceError,
  } = api.source.getById.useQuery(
    { id: sourceId },
    { refetchOnWindowFocus: false },
  );
  const {
    data: segmentData,
    isLoading: isLoadingSegments,
    error: segmentError,
  } = api.segment.getBySource.useQuery(
    { sourceId },
    { refetchOnWindowFocus: false },
  );
  const {
    data: sourceSpeakers = [],
    isLoading: isLoadingSourceSpeakers,
    error: sourceSpeakersError,
  } = api.speaker.getBySource.useQuery(
    { sourceId },
    { refetchOnWindowFocus: false },
  );
  const {
    data: projectSpeakers = [],
    isLoading: isLoadingProjectSpeakers,
    error: projectSpeakersError,
  } = api.speaker.getByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const diarizationStatus = source?.diarization?.status ?? null;
  const isSourceDiarizationRunning =
    diarizationStatus === "pending" || diarizationStatus === "running";
  const isDiarizationCompleted = diarizationStatus === "completed";

  const startDiarizationMutation = api.source.startDiarization.useMutation({
    onSuccess: () => {
      void utils.source.getById.invalidate({ id: sourceId });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? `Failed to start diarization: ${error.message}`
          : "Failed to start diarization",
      );
    },
  });

  const [denoiseBeforeDiarization, setDenoiseBeforeDiarization] =
    useState(false);

  const allSpeakers = projectSpeakers.concat(sourceSpeakers);

  const isLoading =
    isLoadingSource ||
    isLoadingSegments ||
    isLoadingSourceSpeakers ||
    isLoadingProjectSpeakers;

  const error =
    sourceError ?? segmentError ?? sourceSpeakersError ?? projectSpeakersError;

  if (isLoading) {
    return (
      <div className="flex h-56 flex-col gap-2 p-4">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="w-full flex-1" />
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="flex h-56 items-center justify-center text-muted-foreground">
        <p className="text-sm">Failed to load source data</p>
      </div>
    );
  }

  const isDiarizationRunning =
    isSourceDiarizationRunning || startDiarizationMutation.isPending;
  const isDiarizationButtonDisabled =
    !source.storageKey || isDiarizationRunning || isDiarizationCompleted;

  const handleStartDiarization = () => {
    if (isDiarizationButtonDisabled) {
      return;
    }

    startDiarizationMutation.mutate({
      sourceId,
      denoise: denoiseBeforeDiarization,
    });
  };

  return (
    <TimelineContainer
      segments={segmentData?.segments ?? []}
      speakers={allSpeakers}
      sourceId={source.id}
      projectId={projectId}
      speakerId={speakerId}
      sourceData={{
        storageKey: source.storageKey ?? "",
        duration: source.duration ?? 0,
      }}
      onStartDiarization={handleStartDiarization}
      isDiarizationRunning={isDiarizationRunning}
      isDiarizationCompleted={isDiarizationCompleted}
      isDiarizationButtonDisabled={isDiarizationButtonDisabled}
      denoiseBeforeDiarization={denoiseBeforeDiarization}
      onDenoiseBeforeDiarizationChange={setDenoiseBeforeDiarization}
    />
  );
}

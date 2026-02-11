"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

interface ClipStudioTimelineProps {
  projectId: string;
  sourceId: string | null;
}

export function ClipStudioTimeline({
  projectId,
  sourceId,
}: ClipStudioTimelineProps) {
  if (!sourceId) {
    return (
      <div className="flex h-56 items-center justify-center text-muted-foreground">
        <p className="text-sm">
          Select a source to view the timeline
        </p>
      </div>
    );
  }

  return (
    <ClipStudioTimelineInner
      key={sourceId}
      sourceId={sourceId}
      projectId={projectId}
    />
  );
}

function ClipStudioTimelineInner({
  sourceId,
  projectId,
}: {
  sourceId: string;
  projectId: string;
}) {
  const {
    data: source,
    isLoading,
    error,
  } = api.source.getById.useQuery(
    { id: sourceId },
    { refetchOnWindowFocus: false },
  );

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

  return (
    <ClippingStoreProvider
      initialData={{
        sourceId: source.id,
        projectId: projectId,
        segments: source.segments ?? [],
        speakers: source.speakers ?? [],
        storageKey: source.storageKey!,
        playback: { duration: source.duration ?? 0 },
      }}
    >
      <TimelineContainer />
    </ClippingStoreProvider>
  );
}

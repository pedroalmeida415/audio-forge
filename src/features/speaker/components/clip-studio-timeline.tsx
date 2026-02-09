"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

interface ClipStudioTimelineProps {
  projectId: string;
  sessionId: string | null;
}

export function ClipStudioTimeline({
  projectId,
  sessionId,
}: ClipStudioTimelineProps) {
  if (!sessionId) {
    return (
      <div className="flex h-56 items-center justify-center text-muted-foreground">
        <p className="text-sm">
          Select a clipping session to view the timeline
        </p>
      </div>
    );
  }

  return (
    <ClipStudioTimelineInner
      key={sessionId}
      sessionId={sessionId}
      projectId={projectId}
    />
  );
}

function ClipStudioTimelineInner({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const {
    data: session,
    isLoading,
    error,
  } = api.clippingSession.getById.useQuery(
    { id: sessionId },
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

  if (error || !session) {
    return (
      <div className="flex h-56 items-center justify-center text-muted-foreground">
        <p className="text-sm">Failed to load session data</p>
      </div>
    );
  }

  return (
    <ClippingStoreProvider
      initialData={{
        sessionId: session.id,
        fileId: session.file.id,
        projectId: projectId,
        segments: session.segments ?? [],
        speakers: session.speakers ?? [],
        storageKey: session.file.storageKey!,
        playback: { duration: session.file.duration ?? 0 },
      }}
    >
      <TimelineContainer />
    </ClippingStoreProvider>
  );
}

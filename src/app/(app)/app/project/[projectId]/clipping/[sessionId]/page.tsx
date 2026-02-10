"use client";

import { use } from "react";
import { OuterHeader } from "~/features/clipping/components/layout";
import { RightSidebar } from "~/features/clipping/components/sidebar";
import { TableView } from "~/features/clipping/components/table";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

export default function ClippingWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
}) {
  const { projectId, sessionId } = use(params);

  // Fetch source data with speakers and segments
  const [source] = api.source.getById.useSuspenseQuery(
    { id: sessionId },
    { refetchOnWindowFocus: false },
  );

  const sourceName =
    source.name ??
    source.storageKey?.split("/").pop() ??
    "Untitled Source";

  return (
    <ClippingStoreProvider
      initialData={{
        sourceId: source.id,
        projectId: source.projectId!,
        segments: source.segments ?? [],
        speakers: source.speakers ?? [],
        storageKey: source.storageKey!,
        playback: { duration: source.duration ?? 0 },
      }}
    >
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        {/* Outer Header: Back button, source name dropdown, diarize button */}
        <OuterHeader sessionName={sourceName} projectId={projectId} />

        {/* Main content area */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <TableView />
            <RightSidebar />
          </div>
          <TimelineContainer />
        </div>
      </div>
    </ClippingStoreProvider>
  );
}

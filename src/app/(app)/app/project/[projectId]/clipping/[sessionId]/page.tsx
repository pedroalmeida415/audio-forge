"use client";

import { use } from "react";
import { api } from "~/trpc/react";
import { OuterHeader } from "./_components/layout";
import { RightSidebar } from "./_components/sidebar";
import { TableView } from "./_components/table";
import { TimelineContainer } from "./_components/timeline/timeline-container";
import { ClippingStoreProvider } from "./_context/store.context";
import { fetchAudioData } from "./_utils/audio-fetch";

export default function ClippingWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
}) {
  const { projectId, sessionId } = use(params);

  // Fetch session data with file, speakers and segments
  const [session] = api.clippingSession.getById.useSuspenseQuery(
    { id: sessionId },
    { refetchOnWindowFocus: false },
  );

  const [audioUrl] = api.file.getAudioUrl.useSuspenseQuery(
    { fileId: session.fileId },
    { refetchOnWindowFocus: false, staleTime: Infinity },
  );

  const audioDataBuffer = use(fetchAudioData(audioUrl));

  const fileName =
    session.file.name ?? session.file.storageKey?.split("/").pop() ?? "Audio File";

  return (
    <ClippingStoreProvider initialData={{ session, audioDataBuffer }}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        {/* Outer Header: Back button, file name dropdown, diarize button */}
        <OuterHeader fileName={fileName} projectId={projectId} />

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

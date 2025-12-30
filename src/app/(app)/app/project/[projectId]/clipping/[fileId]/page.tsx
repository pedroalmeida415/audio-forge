"use client";

import { use } from "react";
import { api } from "~/trpc/react";
import { SpeakersDrawer } from "./_components/drawers";
import { OuterHeader } from "./_components/layout";
import { RightSidebar } from "./_components/sidebar";
import { TableView } from "./_components/table";
import { TimelineContainer } from "./_components/timeline/timeline-container";
import { ClippingStoreProvider } from "./_context/store.context";
import { fetchAudioData } from "./_utils/audio-fetch";

export default function ClippingWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; fileId: string }>;
}) {
  const { projectId, fileId } = use(params);

  // Fetch file data with speakers and segments
  const [file] = api.file.getById.useSuspenseQuery(
    { id: fileId },
    { refetchOnWindowFocus: false },
  );
  const [audioUrl] = api.file.getAudioUrl.useSuspenseQuery(
    { fileId },
    { refetchOnWindowFocus: false, staleTime: Infinity },
  );

  const audioDataBuffer = use(fetchAudioData(audioUrl));

  const fileName =
    file.name ?? file.storageKey?.split("/").pop() ?? "Audio File";

  return (
    <ClippingStoreProvider initialData={{ file, audioDataBuffer }}>
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

      {/* Speakers Drawer (portal) */}
      <SpeakersDrawer />
    </ClippingStoreProvider>
  );
}

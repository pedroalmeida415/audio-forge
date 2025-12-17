"use client";

import { use } from "react";
import { api } from "~/trpc/react";
import { RightSidebar } from "./_components/sidebar";
import { TableView } from "./_components/table";
import { TimelineContainer } from "./_components/timeline/timeline-container";
import { WorkspaceHeader } from "./_components/workspace-header";
import ClippingWorkspaceProviders from "./_context";
import { fetchAudioData } from "./_utils/audio-fetch";

export default function ClippingWorkspacePage({
  params,
}: {
  params: Promise<{ diarizationId: string }>;
}) {
  const { diarizationId } = use(params);

  const [diarization] = api.diarization.getById.useSuspenseQuery(
    { id: diarizationId },
    { refetchOnWindowFocus: false },
  );
  const [audioUrl] = api.diarization.getAudioUrl.useSuspenseQuery(
    { id: diarizationId },
    { refetchOnWindowFocus: false, staleTime: Infinity },
  );

  const audioDataBuffer = use(fetchAudioData(audioUrl));

  const fileName =
    diarization.file?.storageKey?.split("/").pop() ?? "Audio File";

  console.log("[ClippingWorkspacePage] Rendered");

  return (
    <ClippingWorkspaceProviders initialData={{ diarization, audioDataBuffer }}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        <WorkspaceHeader fileName={fileName} />

        <div className="flex min-h-0 flex-1">
          <TableView />
          <RightSidebar />
        </div>

        <TimelineContainer />
      </div>
    </ClippingWorkspaceProviders>
  );
}

"use client";

import { use } from "react";
import { api } from "~/trpc/react";
import { fetchAudioData } from "../_utils/audio-fetch";
import { SegmentsGrid } from "./_components/segments-grid";
import { SpeakersPanel } from "./_components/speakers-panel";
import { TimelineContainer } from "./_components/timeline/timeline-container";
import { WorkspaceHeader } from "./_components/workspace-header";
import { ClippingWorkspaceProvider } from "./_context/clipping-workspace-context";

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

  return (
    <ClippingWorkspaceProvider initialData={{ diarization, audioDataBuffer }}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        <WorkspaceHeader />

        <div className="flex min-h-0 flex-1">
          <SpeakersPanel />
          <SegmentsGrid />
        </div>

        <TimelineContainer />
      </div>
    </ClippingWorkspaceProvider>
  );
}

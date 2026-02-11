"use client";

import { use } from "react";
import { SpeakerPageLayout } from "~/features/speaker/components/speaker-page-layout";
import { SpeakerPageProvider } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";

export default function SpeakerPage({
  params,
}: {
  params: Promise<{ projectId: string; speakerId: string }>;
}) {
  const { speakerId } = use(params);

  // Fetch speaker data
  const [speaker] = api.speaker.getById.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  // Prefetch all segment IDs (sorted by startTime)
  // Windowed fetching will handle loading actual segments on mount
  const [segmentIds] = api.segment.getIdsBySpeaker.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  return (
    <SpeakerPageProvider
      initialData={{
        speaker,
        segmentIds,
      }}
    >
      <SpeakerPageLayout />
    </SpeakerPageProvider>
  );
}

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
  const { projectId, speakerId } = use(params);

  // Fetch speaker data with stats
  const [speakerData] = api.speaker.getById.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  // Fetch initial segments
  const [segmentsData] = api.segment.getBySpeaker.useSuspenseQuery(
    { speakerId, limit: 50 },
    { refetchOnWindowFocus: false },
  );

  return (
    <SpeakerPageProvider
      initialData={{
        projectId,
        speakerId,
        speaker: speakerData.speaker,
        stats: speakerData.stats,
        initialSegments: segmentsData.items,
        hasMore: !!segmentsData.nextCursor,
        nextCursor: segmentsData.nextCursor,
      }}
    >
      <SpeakerPageLayout />
    </SpeakerPageProvider>
  );
}

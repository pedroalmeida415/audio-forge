"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Button } from "~/components/ui/button";
import { SpeakersPage } from "~/features/speakers/components/speakers-page";
import { SpeakersStoreProvider } from "~/features/speakers/context/speakers.context";
import { api } from "~/trpc/react";

export default function SpeakerSegmentsPage({
  params,
}: {
  params: Promise<{ projectId: string; speakerId: string }>;
}) {
  const { projectId, speakerId } = use(params);

  // Fetch speaker info
  const [speaker] = api.speaker.getById.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  // Fetch segments for this speaker
  const [segments] = api.speaker.getSegmentsBySpeaker.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  return (
    <SpeakersStoreProvider
      initialData={{
        speaker: {
          id: speaker.id,
          name: speaker.name,
          color: speaker.color,
          projectId: speaker.projectId,
          projectName: speaker.project?.name ?? "Project",
          segmentCount: speaker.segmentCount,
        },
        segments,
      }}
    >
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        {/* Header with back navigation */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-border border-b bg-background px-4">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/app/project/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to project</span>
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="text-muted-foreground text-sm">
            Speaker Segments
          </span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          <SpeakersPage />
        </main>
      </div>
    </SpeakersStoreProvider>
  );
}

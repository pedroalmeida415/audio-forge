"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { SpeakerStoreProvider } from "~/features/speaker/context/store-context";
import { api } from "~/trpc/react";

/**
 * Placeholder client component for speaker page content.
 * Will be replaced with full layout in task 1.39.
 */
function SpeakerPageContent() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Speaker Page Content</h1>
        <p className="mt-2 text-muted-foreground">
          Page layout will be implemented in subsequent tasks.
        </p>
      </div>
    </div>
  );
}

export default function SpeakerPage({
  params,
}: {
  params: Promise<{ projectId: string; speakerId: string }>;
}) {
  const { projectId, speakerId } = use(params);

  // Fetch speaker data with segments using suspense query
  const [data, query] = api.speaker.getWithSegments.useSuspenseQuery(
    { speakerId },
    { refetchOnWindowFocus: false },
  );

  // Handle not found case
  if (!data || query.error?.data?.code === "NOT_FOUND") {
    notFound();
  }

  const { speaker, segments } = data;

  return (
    <SpeakerStoreProvider
      initialData={{
        speakerId,
        projectId,
        speaker,
        segments,
      }}
    >
      <SpeakerPageContent />
    </SpeakerStoreProvider>
  );
}

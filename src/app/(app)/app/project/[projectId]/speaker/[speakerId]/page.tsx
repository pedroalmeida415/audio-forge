"use client";

import { notFound } from "next/navigation";
import { use, useState } from "react";
import {
  FilterControls,
  SegmentList,
  SpeakerHeader,
  SpeakerSidebar,
} from "~/features/speaker/components";
import { SpeakerStoreProvider } from "~/features/speaker/context/store-context";
import { api } from "~/trpc/react";

/**
 * Speaker page content component.
 *
 * Renders the full page layout:
 * - SpeakerHeader: full width at top
 * - Main content area: SegmentList (with FilterControls) + SpeakerSidebar
 */
function SpeakerPageContent({
  speakerName,
  projectId,
}: {
  speakerName: string;
  projectId: string;
}) {
  // Export modal state (placeholder for now, will be implemented in export feature)
  const [_isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleExportClick = () => {
    setIsExportModalOpen(true);
    // TODO: Implement export modal in Phase 2
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header - full width */}
      <SpeakerHeader
        speakerName={speakerName}
        projectId={projectId}
        onExportClick={handleExportClick}
      />

      {/* Main content area - list + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* List area with filter controls */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Filter controls in list header area */}
          <div className="border-b p-4">
            <FilterControls />
          </div>

          {/* Segment list */}
          <div className="flex-1 overflow-hidden">
            <SegmentList />
          </div>
        </main>

        {/* Sidebar */}
        <SpeakerSidebar />
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
      <SpeakerPageContent speakerName={speaker.name} projectId={projectId} />
    </SpeakerStoreProvider>
  );
}

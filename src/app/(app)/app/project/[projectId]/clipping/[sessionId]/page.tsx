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

  // Fetch session data with file, speakers and segments
  const [session] = api.clippingSession.getById.useSuspenseQuery(
    { id: sessionId },
    { refetchOnWindowFocus: false },
  );

  const sessionName =
    session.name ??
    session.file.name ??
    session.file.storageKey?.split("/").pop() ??
    "Untitled Session";

  // Audio config for MSE streaming (no upfront download needed)
  const audio = {
    storageKey: session.file.storageKey!,
    duration: session.file.duration ?? 0,
  };

  return (
    <ClippingStoreProvider initialData={{ session, audio }}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        {/* Outer Header: Back button, session name dropdown, diarize button */}
        <OuterHeader sessionName={sessionName} projectId={projectId} />

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

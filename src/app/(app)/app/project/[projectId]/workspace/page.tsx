"use client";

import { use } from "react";
import { ClipStudioPanel } from "~/features/speaker/components/clip-studio-panel";
import { WorkspaceContent } from "~/features/workspace/components/workspace-content";
import { WorkspaceHeader } from "~/features/workspace/components/workspace-header";
import { WorkspaceStoreProvider } from "~/features/workspace/context/workspace-store-context";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return (
    <WorkspaceStoreProvider>
      <WorkspaceHeader />
      <WorkspaceContent />
      <ClipStudioPanel />
    </WorkspaceStoreProvider>
  );
}

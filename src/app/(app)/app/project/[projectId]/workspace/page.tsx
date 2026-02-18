"use client";

import { ClipStudioPanel } from "~/features/workspace/components/clip-studio/clip-studio-panel";
import { WorkspaceContent } from "~/features/workspace/components/workspace-content";
import { WorkspaceHeader } from "~/features/workspace/components/workspace-header";
import { WorkspaceStoreProvider } from "~/features/workspace/context/workspace-store-context";

export default function WorkspacePage() {
  return (
    <WorkspaceStoreProvider>
      <WorkspaceHeader />
      <WorkspaceContent />
      <ClipStudioPanel />
    </WorkspaceStoreProvider>
  );
}

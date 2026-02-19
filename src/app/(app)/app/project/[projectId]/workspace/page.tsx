"use client";

import { ClipStudioPanel } from "~/features/workspace/components/clip-studio/clip-studio-panel";
import { WorkspaceContent } from "~/features/workspace/components/workspace-content";
import { WorkspaceHeader } from "~/features/workspace/components/workspace-header";
import { WorkspaceUploadLayer } from "~/features/workspace/components/workspace-upload-layer";
import { WorkspaceStoreProvider } from "~/features/workspace/context/workspace-store-context";

export default function WorkspacePage() {
  return (
    <WorkspaceStoreProvider>
      <WorkspaceUploadLayer>
        <WorkspaceHeader />
        <WorkspaceContent />
        <ClipStudioPanel />
      </WorkspaceUploadLayer>
    </WorkspaceStoreProvider>
  );
}

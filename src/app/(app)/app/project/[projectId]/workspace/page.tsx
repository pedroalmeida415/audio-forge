"use client";

import { use } from "react";
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
      <div className="flex h-screen min-h-0 flex-col overflow-hidden">
        <WorkspaceHeader projectId={projectId} />

        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          Select a source and speaker to get started.
        </div>
      </div>
    </WorkspaceStoreProvider>
  );
}

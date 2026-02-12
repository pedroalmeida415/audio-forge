"use client";

import { createContext, use, useRef } from "react";
import { proxy } from "valtio";
import { WorkspaceStore } from "~/features/workspace/store/workspace-store";

const WorkspaceStoreContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useRef(proxy(new WorkspaceStore())).current;
  return (
    <WorkspaceStoreContext value={store}>{children}</WorkspaceStoreContext>
  );
}

export function useWorkspaceStore() {
  const store = use(WorkspaceStoreContext);

  if (!store) {
    throw new Error(
      "useWorkspaceStore must be used within WorkspaceStoreProvider",
    );
  }

  return store;
}

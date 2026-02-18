"use client";

import { createContext, use, useRef } from "react";
import { proxy } from "valtio";
import {
  createComputed,
  type WorkspaceComputed,
  WorkspaceStore,
} from "~/features/workspace/store/workspace-store";

interface WorkspaceCtx {
  store: WorkspaceStore;
  computed: WorkspaceComputed;
}

const WorkspaceStoreContext = createContext<WorkspaceCtx | null>(null);

export function WorkspaceStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = useRef<WorkspaceCtx | null>(null);
  if (!ctx.current) {
    const store = proxy(new WorkspaceStore());
    const comp = createComputed(store);
    ctx.current = { store, computed: comp };
  }

  return (
    <WorkspaceStoreContext value={ctx.current}>
      {children}
    </WorkspaceStoreContext>
  );
}

export function useWorkspaceStore(): WorkspaceCtx {
  const ctx = use(WorkspaceStoreContext);

  if (!ctx) {
    throw new Error(
      "useWorkspaceStore must be used within WorkspaceStoreProvider",
    );
  }

  return ctx;
}

"use client";

import { createContext, type ReactNode, use, useState } from "react";
import { useStore } from "zustand";
import { api } from "~/trpc/react";
import {
  type ClippingWorkspaceStore,
  type ClippingWorkspaceStoreApi,
  type ClippingWorkspaceStoreInitialData,
  createClippingWorkspaceStore,
} from "../_store/clipping-workspace-store";

// ============================================================================
// Context
// ============================================================================

const ClippingWorkspaceStoreContext = createContext<
  ClippingWorkspaceStoreApi | undefined
>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ClippingWorkspaceStoreProviderProps {
  children: ReactNode;
  initialData: ClippingWorkspaceStoreInitialData;
}

export function ClippingWorkspaceStoreProvider({
  children,
  initialData,
}: ClippingWorkspaceStoreProviderProps) {
  const trpcUtils = api.useUtils();

  const [store] = useState(() =>
    createClippingWorkspaceStore(initialData, trpcUtils),
  );

  return (
    <ClippingWorkspaceStoreContext.Provider value={store}>
      {children}
    </ClippingWorkspaceStoreContext.Provider>
  );
}

// ============================================================================
// Hook (overloaded)
// ============================================================================

/**
 * Hook to access the clipping workspace store.
 *
 * @param selector - Optional selector function to pick specific state
 * @returns Selected state when selector provided, store API when no selector
 *
 * @example
 * // With selector - returns selected state, triggers re-render on change
 * const isPlaying = useClippingWorkspaceStore((s) => s.isPlaying);
 *
 * @example
 * // Without selector - returns store API for direct access/subscribe
 * const store = useClippingWorkspaceStore();
 * store.subscribe((state) => state.currentTime, (time) => { ... });
 */
export function useClippingWorkspaceStore<T>(
  selector: (store: ClippingWorkspaceStore) => T,
): T;
export function useClippingWorkspaceStore(): ClippingWorkspaceStoreApi;
export function useClippingWorkspaceStore<T>(
  selector?: (store: ClippingWorkspaceStore) => T,
) {
  const store = use(ClippingWorkspaceStoreContext);

  if (!store) {
    throw new Error(
      "useClippingWorkspaceStore must be used within ClippingWorkspaceStoreProvider",
    );
  }

  // biome-ignore lint/correctness/useHookAtTopLevel: Overloaded hook pattern - selector is always defined in typed overload
  // biome-ignore lint/style/noNonNullAssertion: Selector is always defined in typed overload
  return selector ? useStore(store, selector!) : store;
}

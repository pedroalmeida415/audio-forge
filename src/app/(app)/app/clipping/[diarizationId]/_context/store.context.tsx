"use client";

import { createContext, type ReactNode, use, useState } from "react";
import { useStore } from "zustand";
import { api } from "~/trpc/react";
import {
  type ClippingStore,
  type ClippingStoreApi,
  type ClippingStoreInitialData,
  createClippingStore,
} from "../_store/clipping-workspace-store";

// ============================================================================
// Context
// ============================================================================

const ClippingStoreContext = createContext<ClippingStoreApi | undefined>(
  undefined,
);

// ============================================================================
// Provider
// ============================================================================

interface ClippingStoreProviderProps {
  children: ReactNode;
  initialData: ClippingStoreInitialData;
}

export function ClippingStoreProvider({
  children,
  initialData,
}: ClippingStoreProviderProps) {
  const trpcUtils = api.useUtils();

  const [store] = useState(() => createClippingStore(initialData, trpcUtils));

  return (
    <ClippingStoreContext.Provider value={store}>
      {children}
    </ClippingStoreContext.Provider>
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
 * const isPlaying = useClippingStore((s) => s.isPlaying);
 *
 * @example
 * // Without selector - returns store API for direct access/subscribe
 * const store = useClippingStore();
 * store.subscribe((state) => state.currentTime, (time) => { ... });
 */
export function useClippingStore<T>(selector: (store: ClippingStore) => T): T;
export function useClippingStore(): ClippingStoreApi;
export function useClippingStore<T>(selector?: (store: ClippingStore) => T) {
  const store = use(ClippingStoreContext);

  if (!store) {
    throw new Error(
      "useClippingStore must be used within ClippingStoreProvider",
    );
  }

  // biome-ignore lint/correctness/useHookAtTopLevel: Overloaded hook pattern - selector is always defined in typed overload
  // biome-ignore lint/style/noNonNullAssertion: Selector is always defined in typed overload
  return selector ? useStore(store, selector!) : store;
}

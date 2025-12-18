"use client";

import { createContext, type ReactNode, use, useState } from "react";
import { api } from "~/trpc/react";
import {
  type $ClippingStore,
  type ClippingStoreInitialData,
  createClippingStore,
} from "../_store/clipping-store";

// ============================================================================
// Context
// ============================================================================

const ClippingStoreContext = createContext<$ClippingStore | undefined>(
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

  // useObservable returns a stable observable across renders
  const [$store] = useState(createClippingStore(initialData, trpcUtils));

  return (
    <ClippingStoreContext.Provider value={$store}>
      {children}
    </ClippingStoreContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the clipping workspace store observable.
 *
 * Returns the LegendState observable for the clipping workspace.
 * Use with LegendState's reactivity APIs:
 *
 * @example
 * // Read reactive values with useValue
 * const $store = useClippingStore();
 * const isPlaying = useValue($store.playback.isPlaying);
 *
 * @example
 * // Set values directly
 * $store.playback.isPlaying.set(true);
 *
 * @example
 * // Call co-located actions
 * $store.selection.selectSegment(segmentId);
 * $store.timeline.zoomIn();
 * $store.segmentActions.updateTimes(segmentId, start, end);
 *
 * @example
 * // Subscribe to changes with observe
 * observe(() => {
 *   const time = $store.playback.currentTime.get();
 *   // DOM manipulation or side effects
 * });
 */
export function useClippingStore(): $ClippingStore {
  const $store = use(ClippingStoreContext);

  if (!$store) {
    throw new Error(
      "useClippingStore must be used within ClippingStoreProvider",
    );
  }

  return $store;
}

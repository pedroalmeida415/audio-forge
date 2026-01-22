"use client";

import { createContext, type ReactNode, use } from "react";
import {
  type $SpeakerPageStore,
  createSpeakerPageStore,
  type SpeakerPageInitialData,
} from "~/features/speaker/store/speaker-page-store";

// ============================================================================
// Context
// ============================================================================

const SpeakerPageStoreContext = createContext<ReturnType<
  typeof createSpeakerPageStore
> | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SpeakerPageProviderProps {
  children: ReactNode;
  initialData: SpeakerPageInitialData;
}

export function SpeakerPageProvider({
  children,
  initialData,
}: SpeakerPageProviderProps) {
  const $store = createSpeakerPageStore(initialData);

  return (
    <SpeakerPageStoreContext.Provider value={$store}>
      {children}
    </SpeakerPageStoreContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the speaker page store observable.
 *
 * Returns the LegendState observable for the speaker page.
 *
 * @example
 * // Read reactive values with useValue
 * const $store = useSpeakerPageStore();
 * const selectedIds = useValue($store.selectedSegmentIds);
 *
 * @example
 * // Set values directly
 * $store.toggleSelection(segmentId);
 */
export function useSpeakerPageStore(): $SpeakerPageStore {
  const $store = use(SpeakerPageStoreContext);

  if (!$store) {
    throw new Error(
      "useSpeakerPageStore must be used within SpeakerPageProvider",
    );
  }

  return $store;
}

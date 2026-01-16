"use client";

import { createContext, type ReactNode, use } from "react";
import {
  type $SpeakerPageStore,
  createSpeakerPageStore,
  type SpeakerPageStoreInitialData,
} from "~/features/speaker/store/speaker-store";

// ============================================================================
// Context
// ============================================================================

const SpeakerStoreContext = createContext<$SpeakerPageStore | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SpeakerStoreProviderProps {
  children: ReactNode;
  initialData: SpeakerPageStoreInitialData;
}

export function SpeakerStoreProvider({
  children,
  initialData,
}: SpeakerStoreProviderProps) {
  // useObservable (inside createSpeakerPageStore) returns a stable observable across renders
  const $store = createSpeakerPageStore(initialData);

  return (
    <SpeakerStoreContext.Provider value={$store}>
      {children}
    </SpeakerStoreContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the speaker page store observable.
 *
 * Returns the LegendState observable for the speaker page.
 * Use with LegendState's reactivity APIs:
 *
 * @example
 * // Read reactive values with useValue
 * const $store = useSpeakerStore();
 * const filters = useValue($store.filters);
 *
 * @example
 * // Set values directly
 * $store.setFilter("durationMin", 1);
 *
 * @example
 * // Call co-located actions
 * $store.toggleSegmentSelection(segmentId);
 * $store.clearFilters();
 *
 * @example
 * // Access computed values
 * const filteredSegments = $store.filteredSegments();
 * const stats = $store.statistics();
 */
export function useSpeakerStore(): $SpeakerPageStore {
  const $store = use(SpeakerStoreContext);

  if (!$store) {
    throw new Error("useSpeakerStore must be used within SpeakerStoreProvider");
  }

  return $store;
}

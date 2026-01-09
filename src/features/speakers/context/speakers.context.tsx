"use client";

import { createContext, type ReactNode, use, useEffect, useRef } from "react";
import { AudioCache } from "~/features/speakers/store/audio-cache";
import {
  type $SpeakersStore,
  createSpeakersStore,
  type SpeakersStoreInitialData,
} from "~/features/speakers/store/speakers-store";

// ============================================================================
// Context
// ============================================================================

const SpeakersStoreContext = createContext<$SpeakersStore | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SpeakersStoreProviderProps {
  children: ReactNode;
  initialData: SpeakersStoreInitialData;
}

export function SpeakersStoreProvider({
  children,
  initialData,
}: SpeakersStoreProviderProps) {
  // Create audio cache once per provider instance
  const audioCacheRef = useRef<AudioCache | null>(null);
  if (!audioCacheRef.current) {
    audioCacheRef.current = new AudioCache(10);
  }

  const { $store, cleanup } = createSpeakersStore(
    initialData,
    audioCacheRef.current,
  );

  // Cleanup on unmount
  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      cleanup();
      cache?.destroy();
    };
  }, [cleanup]);

  return (
    <SpeakersStoreContext.Provider value={$store}>
      {children}
    </SpeakersStoreContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the speakers store observable.
 *
 * @example
 * const $store = useSpeakersStore();
 * const playingCount = useValue($store.playingCount);
 *
 * // Play a segment
 * $store.playSegment(segmentId);
 */
export function useSpeakersStore(): $SpeakersStore {
  const $store = use(SpeakersStoreContext);

  if (!$store) {
    throw new Error(
      "useSpeakersStore must be used within SpeakersStoreProvider",
    );
  }

  return $store;
}

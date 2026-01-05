"use client";

import { createContext, type ReactNode, use } from "react";
import type { StoreStateOverrides } from "~/features/clipping/context/test-utils";
import { usePlayback } from "~/features/clipping/hooks/use-playback";
import {
  type $ClippingStore,
  type ClippingStoreInitialData,
  createClippingStore,
} from "~/features/clipping/store/clipping-store";

// ============================================================================
// Context - same as real implementation
// ============================================================================

export const ClippingStoreContext = createContext<ReturnType<
  typeof createClippingStore
> | null>(null);

// ============================================================================
// Provider - simplified version without tRPC dependencies
// ============================================================================

interface ClippingStoreProviderProps {
  children: ReactNode;
  initialData: ClippingStoreInitialData;
  /** State overrides for testing - read from Storybook parameters */
  stateOverrides?: StoreStateOverrides;
}

/**
 * Mock provider for Storybook stories.
 * Same API as the real provider but without DiarizationSubscriber (SSE).
 * Supports stateOverrides for testing different visual states.
 */
export function ClippingStoreProvider({
  children,
  initialData,
  stateOverrides,
}: ClippingStoreProviderProps) {
  const $store = createClippingStore(initialData);

  // Apply optional state overrides for testing
  if (stateOverrides) {
    if (stateOverrides.zoomLevel !== undefined) {
      $store.timeline.zoomLevel.set(stateOverrides.zoomLevel);
    }
    if (stateOverrides.scrollOffset !== undefined) {
      $store.timeline.scrollOffset.set(stateOverrides.scrollOffset);
    }
    if (stateOverrides.selectedSpeakerId !== undefined) {
      $store.selectedSpeakerId.set(stateOverrides.selectedSpeakerId);
    }
    if (stateOverrides.activeSegmentId !== undefined) {
      $store.activeSegmentId.set(stateOverrides.activeSegmentId);
    }
  }

  return (
    <ClippingStoreContext.Provider value={$store}>
      <PlaybackInitializer $store={$store} stateOverrides={stateOverrides} />
      {children}
    </ClippingStoreContext.Provider>
  );
}

// ============================================================================
// Hook - same as real implementation
// ============================================================================

export function useClippingStore(): $ClippingStore {
  const $store = use(ClippingStoreContext);

  if (!$store) {
    throw new Error(
      "useClippingStore must be used within ClippingStoreProvider",
    );
  }

  return $store;
}

// ============================================================================
// Playback Initializer
// ============================================================================

function PlaybackInitializer({
  $store,
  stateOverrides,
}: {
  $store: ReturnType<typeof createClippingStore>;
  stateOverrides?: StoreStateOverrides;
}) {
  usePlayback($store);

  // Apply playback-specific overrides after usePlayback initializes
  if (stateOverrides?.currentTime !== undefined) {
    $store.playback.currentTime.set(stateOverrides.currentTime);
  }
  if (stateOverrides?.isPlaying !== undefined) {
    $store.playback.isPlaying.set(stateOverrides.isPlaying);
  }

  return null;
}

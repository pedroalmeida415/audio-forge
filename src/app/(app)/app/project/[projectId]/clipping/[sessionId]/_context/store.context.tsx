"use client";

import { useValue } from "@legendapp/state/react";
import { createContext, type ReactNode, use } from "react";
import { api } from "~/trpc/react";
import { usePlayback } from "../_hooks/use-playback";
import {
  type $ClippingStore,
  type ClippingStoreInitialData,
  createClippingStore,
} from "../_store/clipping-store";

// ============================================================================
// Context
// ============================================================================

const ClippingStoreContext = createContext<ReturnType<
  typeof createClippingStore
> | null>(null);

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
  // useObservable returns a stable observable across renders
  const $store = createClippingStore(initialData);

  return (
    <ClippingStoreContext.Provider value={$store}>
      <PlaybackInitializer />
      <DiarizationSubscriber />
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
 * $store.selectSegment(segmentId);
 * $store.timeline.zoomIn();
 *
 * @example
 * // Subscribe to changes with observe
 * useObserve(() => {
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

// ============================================================================
// Playback Initializer - separate component to isolate hooks
// ============================================================================

function PlaybackInitializer() {
  const $store = useClippingStore();

  usePlayback($store);

  return null;
}

// ============================================================================
// Diarization Subscriber - subscribes to SSE events for diarization completion
// ============================================================================

function DiarizationSubscriber() {
  const $store = useClippingStore();
  const sessionId = useValue($store.sessionId);
  const trpcUtils = api.useUtils();

  api.clippingSession.onDiarizationComplete.useSubscription(
    { sessionId },
    {
      onData: async (event) => {
        if (event.status === "completed") {
          // Refetch session data from server
          const session = await trpcUtils.clippingSession.getById.fetch({
            id: sessionId,
          });

          // Replace store state with server data
          $store.replaceSessionData(
            session.segments ?? [],
            session.speakers ?? [],
          );
        }
        // For failed status, we could show a toast, but for now just log
        if (event.status === "failed") {
          console.error("Diarization failed for session:", sessionId);
        }
      },
      onError: (error) => {
        console.error("Diarization subscription error:", error);
      },
    },
  );

  return null;
}

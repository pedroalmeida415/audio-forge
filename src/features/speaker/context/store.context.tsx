"use client";

import { useValue } from "@legendapp/state/react";
import { createContext, type ReactNode, use } from "react";
import {
  type $SpeakerPageStore,
  createSpeakerPageStore,
  type SpeakerPageInitialData,
} from "~/features/speaker/store/speaker-page-store";
import { api } from "~/trpc/react";

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
      <ClipSubscriber />
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

// ============================================================================
// Clip Subscriber - subscribes to SSE events for clip completion
// ============================================================================

function ClipSubscriber() {
  const $store = useSpeakerPageStore();
  const speakerId = useValue($store.speakerId);
  const trpcUtils = api.useUtils();

  api.segment.onClipCreated.useSubscription(
    { speakerId },
    {
      onData: async (event) => {
        // Remove segment from pending state
        $store.markSegmentComplete(event.segmentId);

        if (event.status === "completed") {
          // Refetch the segment to get updated clip data
          // We fetch a small batch that includes this segment
          const result = await trpcUtils.segment.getBySpeaker.fetch({
            speakerId,
            limit: 100, // Fetch all to find our segment
          });

          // Find the updated segment and update the store
          const updatedSegment = result.items.find(
            (s) => s.id === event.segmentId,
          );
          if (updatedSegment?.clip) {
            $store.updateSegmentClip(event.segmentId, updatedSegment.clip);
            // Update stats - increment clips count
            const currentStats = $store.stats.peek();
            $store.updateStats({
              clipsCount: currentStats.clipsCount + 1,
            });
          }
        }

        if (event.status === "failed") {
          console.error(
            "Clip processing failed for segment:",
            event.segmentId,
            event.error,
          );
        }
      },
      onError: (error) => {
        console.error("Clip subscription error:", error);
      },
    },
  );

  return null;
}

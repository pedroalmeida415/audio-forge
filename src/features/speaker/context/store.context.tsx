"use client";

import { useParams } from "next/navigation";
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
  const { speakerId } = useParams<{ speakerId: string }>();
  const $store = useSpeakerPageStore();

  api.segment.onClipCreated.useSubscription(
    { speakerId },
    {
      onData: (event) => {
        // Remove segment from clip pending state
        $store.markClipComplete(event.segmentId);

        if (event.status === "completed" && event.clip) {
          // Update the segment's clip in the loaded segments Map
          // Convert ISO string back to Date for the clip
          const clip = {
            id: event.clip.id,
            segmentId: event.clip.segmentId,
            userId: event.clip.userId,
            storageKey: event.clip.storageKey,
            duration: event.clip.duration,
            processingStatus: event.clip.processingStatus,
            processingError: event.clip.processingError,
            scores: event.clip.scores,
            createdAt: new Date(event.clip.createdAt),
          };

          $store.updateSegmentClip(event.segmentId, clip);
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

import { enableMapSet } from "immer";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import type { api } from "~/trpc/react";
import {
  createPlaybackSlice,
  createSegmentsSlice,
  createTimelineSlice,
  createUISlice,
  TIMELINE_CONSTANTS,
} from "./slices";
import type {
  ClippingStore,
  DiarizationData,
  DiarizationSegment,
  SegmentWithId,
} from "./types";

enableMapSet();

// ============================================================================
// Helper Functions
// ============================================================================

function createSegmentsWithIds(
  segments: DiarizationSegment[],
): Record<string, SegmentWithId> {
  return segments.reduce(
    (acc, segment, index) => {
      const id = `${segment.speaker}-${index}-${segment.start}-${segment.end}`;
      acc[id] = {
        ...segment,
        id,
      };
      return acc;
    },
    {} as Record<string, SegmentWithId>,
  );
}

// ============================================================================
// Store Factory
// ============================================================================

export interface ClippingStoreInitialData {
  diarization: DiarizationData;
}

export function createClippingStore(
  initialData: ClippingStoreInitialData,
  trpcUtils: ReturnType<typeof api.useUtils>,
) {
  const { diarization } = initialData;
  const segmentsById = createSegmentsWithIds(
    diarization.output?.segments ?? [],
  );
  const speakerCollections = diarization.speakerCollections ?? {};

  const segmentsInitialData = {
    diarizationId: diarization.id,
    projectId: diarization.projectId,
    segmentsById,
    speakerCollections,
  };

  const store = createStore<ClippingStore>()(
    subscribeWithSelector(
      immer((...args) => ({
        playback: createPlaybackSlice(...args),
        timeline: createTimelineSlice(...args),
        ui: createUISlice(...args),
        segments: createSegmentsSlice(segmentsInitialData)(...args),
      })),
    ),
  );

  // Set up tRPC mutation defaults for optimistic updates
  trpcUtils.diarization.setSpeakerCollection.setMutationDefaults({
    onMutate: async (input) => {
      const { speaker, collectionId, collectionName, diarizationId } = input;
      const currentState = store.getState();

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      // Snapshot the previous value
      const previousMapping: {
        collectionId: string;
        collectionName: string;
      } | null = currentState.segments.speakerCollections[speaker] ?? null;

      // Optimistically update the store
      currentState.segments.setSpeakerCollection(speaker, {
        collectionId,
        collectionName,
      });

      // Return context with previous value for rollback
      return { previousMapping };
    },
    onError: (_err, newData, context) => {
      // Rollback to previous state on error
      if (context?.previousMapping) {
        store
          .getState()
          .segments.setSpeakerCollection(
            newData.speaker,
            context.previousMapping,
          );
      }
    },
    onSettled: (_, __, context, res) => {
      // Invalidate to refetch fresh data
      void trpcUtils.diarization.getById.invalidate({
        id: context.diarizationId,
      });
    },
  });

  return store;
}

export type ClippingStoreApi = ReturnType<typeof createClippingStore>;

// ============================================================================
// Re-exports
// ============================================================================

export { TIMELINE_CONSTANTS };
export type {
  ClippingStore,
  DiarizationData,
  DiarizationSegment,
  FilterConfig,
  SegmentAlertType,
  SegmentWithId,
  SortConfig,
  SpeakerCollections,
  SpeakerMetadata,
  ViewMode,
} from "./types";

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
import type { ClippingStore, DiarizationData, SegmentWithId } from "./types";

enableMapSet();

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

  // Convert segments array to indexed record by ID (IDs now come from backend)
  const segments = diarization.output?.segments ?? [];
  const segmentsById = segments.reduce(
    (acc, segment) => {
      acc[segment.id] = segment;
      return acc;
    },
    {} as Record<string, SegmentWithId>,
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
    onSettled: (_, __, context) => {
      // Invalidate to refetch fresh data
      void trpcUtils.diarization.getById.invalidate({
        id: context.diarizationId,
      });
    },
  });

  // Set up mutation defaults for segment updates
  trpcUtils.diarization.updateSegments.setMutationDefaults({
    onMutate: async (input) => {
      const { diarizationId, segmentIds, updates } = input;
      const currentState = store.getState();

      // Cancel any outgoing refetches
      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      // Normalize to array and snapshot previous values
      const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
      const previousSegments = ids.map((id) => ({
        id,
        data: { ...currentState.segments.segmentsById[id] },
      }));

      // Optimistically update each segment
      for (const id of ids) {
        const segment = currentState.segments.segmentsById[id];
        if (segment) {
          // Apply updates
          if (updates.start !== undefined || updates.end !== undefined) {
            currentState.segments.updateSegmentTimes(
              id,
              updates.start ?? segment.start,
              updates.end ?? segment.end,
            );
          }
          if (updates.speaker !== undefined) {
            currentState.segments.changeSpeaker([id], updates.speaker);
          }
          if (updates.isDeleted !== undefined) {
            if (updates.isDeleted) {
              currentState.segments.archiveSegment(id);
            } else {
              currentState.segments.restoreSegment(id);
            }
          }
          if (updates.isReviewed !== undefined) {
            if (updates.isReviewed) {
              currentState.segments.markAsReviewed([id]);
            } else {
              currentState.segments.markAsUnreviewed([id]);
            }
          }
        }
      }

      return { previousSegments, diarizationId };
    },
    onError: (_err, _input, context) => {
      // Rollback on error
      if (context?.previousSegments) {
        store.getState().segments.bulkRestoreSegments(context.previousSegments);
      }
    },
    onSettled: (_, __, context) => {
      if (context?.diarizationId) {
        void trpcUtils.diarization.getById.invalidate({
          id: context.diarizationId,
        });
      }
    },
  });

  // Set up mutation defaults for segment splitting
  trpcUtils.diarization.splitSegment.setMutationDefaults({
    onMutate: async (input) => {
      const { diarizationId, segmentId, splitTime } = input;
      const currentState = store.getState();

      // Cancel any outgoing refetches
      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      // Snapshot original segment before split
      const originalSegment = {
        ...currentState.segments.segmentsById[segmentId],
      };

      // Optimistically split the segment
      const { firstId, secondId } = currentState.segments.splitSegment(
        segmentId,
        splitTime,
      );

      return { originalSegment, diarizationId, firstId, secondId };
    },
    onError: (_err, _input, context) => {
      // Rollback: undo the split
      if (context?.originalSegment && context.firstId && context.secondId) {
        store
          .getState()
          .segments.undoSplit(
            context.firstId,
            context.secondId,
            context.originalSegment,
          );
      }
    },
    onSettled: (_, __, context) => {
      if (context?.diarizationId) {
        void trpcUtils.diarization.getById.invalidate({
          id: context.diarizationId,
        });
      }
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
  SegmentWithId,
  SpeakerCollections,
  SpeakerMetadata,
  ViewMode,
} from "./types";

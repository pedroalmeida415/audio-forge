import { randomUUID } from "node:crypto";
import type {
  SegmentsInitialData,
  SegmentsSlice,
  SegmentWithId,
  SliceCreator,
} from "../types";

export const createSegmentsSlice =
  (initialData: SegmentsInitialData): SliceCreator<SegmentsSlice> =>
  (set) => ({
    // Core data
    diarizationId: initialData.diarizationId,
    projectId: initialData.projectId,
    segmentsById: initialData.segmentsById,
    speakerCollections: initialData.speakerCollections,
    // Selection state
    selectedSpeaker: null,
    selectedSegmentId: null,
    selectedSegmentIds: new Set<string>(),
    // Active segment (distinct from selection)
    activeSegmentId: null,

    // Selection actions
    selectSpeaker: (speaker) =>
      set((state) => {
        state.segments.selectedSpeaker = speaker;
        state.segments.selectedSegmentId = null;
        state.segments.selectedSegmentIds = new Set();
      }),

    selectSegment: (segmentId) =>
      set((state) => {
        if (!segmentId) {
          state.segments.selectedSegmentId = null;
          return;
        }
        const segment = state.segments.segmentsById[segmentId];
        if (segment && segment.speaker !== state.segments.selectedSpeaker) {
          state.segments.selectedSegmentId = segmentId;
          state.segments.selectedSpeaker = segment.speaker;
        } else {
          state.segments.selectedSegmentId = segmentId;
        }
      }),

    toggleSegmentSelection: (segmentId) =>
      set((state) => {
        const newSet = new Set(state.segments.selectedSegmentIds);
        if (newSet.has(segmentId)) {
          newSet.delete(segmentId);
        } else {
          newSet.add(segmentId);
        }
        state.segments.selectedSegmentIds = newSet;
      }),

    selectAllSegments: () =>
      set((state) => {
        if (!state.segments.selectedSpeaker) {
          return;
        }
        const visibleSegmentIds = Object.values(state.segments.segmentsById)
          .filter((s) => !s.isDeleted)
          .filter((s) => s.speaker === state.segments.selectedSpeaker)
          .map((s) => s.id);
        state.segments.selectedSegmentIds = new Set(visibleSegmentIds);
      }),

    clearSelection: () =>
      set((state) => {
        state.segments.selectedSegmentIds = new Set();
      }),

    setSelectedSegmentIds: (ids) =>
      set((state) => {
        state.segments.selectedSegmentIds = ids;
      }),

    // Active segment action
    setActiveSegment: (segmentId) =>
      set((state) => {
        state.segments.activeSegmentId = segmentId;
        // If segment is in a different speaker, switch to that speaker view
        if (segmentId) {
          const segment = state.segments.segmentsById[segmentId];
          if (segment && segment.speaker !== state.segments.selectedSpeaker) {
            state.segments.selectedSpeaker = segment.speaker;
          }
        }
      }),

    // Segment mutations
    archiveSegment: (segmentId) =>
      set((state) => {
        const segment = state.segments.segmentsById[segmentId];
        if (segment) {
          segment.isDeleted = true;
        }
        state.segments.selectedSegmentIds.delete(segmentId);
      }),

    archiveSelectedSegments: () =>
      set((state) => {
        for (const segmentId of state.segments.selectedSegmentIds) {
          const segment = state.segments.segmentsById[segmentId];
          if (segment) {
            segment.isDeleted = true;
          }
        }
        state.segments.selectedSegmentIds = new Set();
      }),

    restoreSegment: (segmentId) =>
      set((state) => {
        const segment = state.segments.segmentsById[segmentId];
        if (segment) {
          segment.isDeleted = false;
        }
      }),

    markAsReviewed: (segmentIds) =>
      set((state) => {
        for (const segmentId of segmentIds) {
          const segment = state.segments.segmentsById[segmentId];
          if (segment) {
            segment.isReviewed = true;
          }
        }
      }),

    markAsUnreviewed: (segmentIds) =>
      set((state) => {
        for (const segmentId of segmentIds) {
          const segment = state.segments.segmentsById[segmentId];
          if (segment) {
            segment.isReviewed = false;
          }
        }
      }),

    changeSpeaker: (segmentIds, newSpeaker) =>
      set((state) => {
        for (const segmentId of segmentIds) {
          const segment = state.segments.segmentsById[segmentId];
          if (segment) {
            segment.speaker = newSpeaker;
          }
        }
      }),

    // Time and split mutations
    updateSegmentTimes: (segmentId, start, end) =>
      set((state) => {
        const segment = state.segments.segmentsById[segmentId];
        if (segment) {
          segment.start = Math.max(0, start);
          segment.end = Math.max(segment.start + 0.1, end);
        }
      }),

    splitSegment: (segmentId, splitTime) => {
      let firstId = "";
      let secondId = "";

      set((state) => {
        const segment = state.segments.segmentsById[segmentId];
        if (!segment) return;
        if (splitTime <= segment.start || splitTime >= segment.end) return;

        // Generate new ID for the second segment
        secondId = randomUUID();
        firstId = segment.id;

        // Create new segment from split point to original end
        const newSegment: SegmentWithId = {
          ...segment,
          id: secondId,
          start: splitTime,
          end: segment.end,
          isReviewed: false,
        };

        // Update original segment's end to split point
        segment.end = splitTime;

        // Add new segment to store
        state.segments.segmentsById[secondId] = newSegment;

        // Set the new segment as active
        state.segments.activeSegmentId = secondId;
      });

      return { firstId, secondId };
    },

    // Rollback helpers (for optimistic updates)
    restoreSegmentData: (segmentId, data) =>
      set((state) => {
        state.segments.segmentsById[segmentId] = data;
      }),

    undoSplit: (firstId, secondId, original) =>
      set((state) => {
        // Remove the second segment
        delete state.segments.segmentsById[secondId];
        // Restore the original segment
        state.segments.segmentsById[firstId] = original;
        // Reset active segment if it was the removed one
        if (state.segments.activeSegmentId === secondId) {
          state.segments.activeSegmentId = firstId;
        }
      }),

    bulkRestoreSegments: (segments) =>
      set((state) => {
        for (const { id, data } of segments) {
          state.segments.segmentsById[id] = data;
        }
      }),

    // Speaker collection mapping
    setSpeakerCollection: (speaker, collection) =>
      set((state) => {
        state.segments.speakerCollections[speaker] = collection;
      }),
  });

import type {
  SegmentsInitialData,
  SegmentsSlice,
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

    // Speaker collection mapping
    setSpeakerCollection: (speaker, collection) =>
      set((state) => {
        state.segments.speakerCollections[speaker] = collection;
      }),
  });

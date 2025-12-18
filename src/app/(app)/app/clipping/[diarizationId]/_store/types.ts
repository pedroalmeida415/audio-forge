import type { StateCreator } from "zustand";

// ============================================================================
// Domain Types
// ============================================================================

// Re-export from schema for consistency
export type { DiarizationSegment } from "~/server/db/schema";

// Alias for backward compatibility (segments now always have IDs from backend)
export type SegmentWithId = import("~/server/db/schema").DiarizationSegment;

export type ViewMode = "table" | "focus";

export type SpeakerCollections = Record<
  string,
  { collectionId: string; collectionName: string }
>;

export interface FilterConfig {
  reviewed: boolean | null;
}

export interface SpeakerMetadata {
  id: string;
  label: string;
  segmentCount: number;
  totalDuration: number;
  percentage: number;
  colorIndex: number;
}

// ============================================================================
// Playback Slice
// ============================================================================

export interface PlaybackSlice {
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  setIsPlaying: (isPlaying: boolean) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentTime: (time: number) => void;
}

// ============================================================================
// Timeline Slice
// ============================================================================

export interface TimelineSlice {
  zoomLevel: number;
  containerWidth: number;
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setContainerWidth: (width: number) => void;
}

// ============================================================================
// UI Slice
// ============================================================================

export interface UISlice {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

// ============================================================================
// Segments Slice
// ============================================================================

export interface SegmentsSlice {
  // Core data
  diarizationId: string;
  projectId: string;
  segmentsById: Record<string, SegmentWithId>;
  speakerCollections: SpeakerCollections;
  // Selection state
  selectedSpeaker: string | null;
  selectedSegmentId: string | null;
  selectedSegmentIds: Set<string>;
  // Active segment (distinct from selection, used for single-segment operations)
  activeSegmentId: string | null;
  // Selection actions
  selectSpeaker: (speaker: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
  toggleSegmentSelection: (segmentId: string) => void;
  selectAllSegments: () => void;
  clearSelection: () => void;
  setSelectedSegmentIds: (ids: Set<string>) => void;
  // Active segment action
  setActiveSegment: (segmentId: string | null) => void;
  // Segment mutations
  archiveSegment: (segmentId: string) => void;
  archiveSelectedSegments: () => void;
  restoreSegment: (segmentId: string) => void;
  markAsReviewed: (segmentIds: string[]) => void;
  markAsUnreviewed: (segmentIds: string[]) => void;
  changeSpeaker: (segmentIds: string[], newSpeaker: string) => void;
  // Time and split mutations
  updateSegmentTimes: (segmentId: string, start: number, end: number) => void;
  splitSegment: (
    segmentId: string,
    splitTime: number,
  ) => { firstId: string; secondId: string };
  // Rollback helpers (for optimistic updates)
  restoreSegmentData: (segmentId: string, data: SegmentWithId) => void;
  undoSplit: (
    firstId: string,
    secondId: string,
    original: SegmentWithId,
  ) => void;
  bulkRestoreSegments: (
    segments: Array<{ id: string; data: SegmentWithId }>,
  ) => void;
  // Speaker collection mapping
  setSpeakerCollection: (
    speaker: string,
    collection: { collectionId: string; collectionName: string },
  ) => void;
}

// ============================================================================
// Combined Store
// ============================================================================

export interface ClippingStore {
  playback: PlaybackSlice;
  timeline: TimelineSlice;
  ui: UISlice;
  segments: SegmentsSlice;
}

// ============================================================================
// Slice Creator Type
// ============================================================================

export type SliceCreator<T> = StateCreator<
  ClippingStore,
  [["zustand/immer", never]],
  [],
  T
>;

// ============================================================================
// Initial Data Types
// ============================================================================

export interface DiarizationData {
  id: string;
  projectId: string;
  output: {
    segments: DiarizationSegment[];
  } | null;
  speakerCollections: SpeakerCollections | null;
  file: {
    storageKey: string | null;
  } | null;
}

export interface SegmentsInitialData {
  diarizationId: string;
  projectId: string;
  segmentsById: Record<string, SegmentWithId>;
  speakerCollections: SpeakerCollections;
}

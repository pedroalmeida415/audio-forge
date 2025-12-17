import type { StateCreator } from "zustand";

// ============================================================================
// Domain Types
// ============================================================================

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SegmentWithId extends DiarizationSegment {
  id: string;
  isDeleted?: boolean;
  isReviewed?: boolean;
}

export type SegmentAlertType = "too_long" | "too_short" | "no_text";

export type ViewMode = "table" | "focus";

export type SpeakerCollections = Record<
  string,
  { collectionId: string; collectionName: string }
>;

export interface SortConfig {
  column: "duration" | "reviewed" | "alerts";
  direction: "asc" | "desc";
}

export interface FilterConfig {
  alerts: SegmentAlertType[];
  reviewed: boolean | null;
  search: string;
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
  sortBy: SortConfig | null;
  filters: FilterConfig;
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (config: SortConfig | null) => void;
  setFilters: (filters: Partial<FilterConfig>) => void;
  clearFilters: () => void;
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
  // Selection actions
  selectSpeaker: (speaker: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
  toggleSegmentSelection: (segmentId: string) => void;
  selectAllSegments: () => void;
  clearSelection: () => void;
  setSelectedSegmentIds: (ids: Set<string>) => void;
  // Segment mutations
  archiveSegment: (segmentId: string) => void;
  archiveSelectedSegments: () => void;
  restoreSegment: (segmentId: string) => void;
  markAsReviewed: (segmentIds: string[]) => void;
  markAsUnreviewed: (segmentIds: string[]) => void;
  changeSpeaker: (segmentIds: string[], newSpeaker: string) => void;
  // Speaker collection mapping
  setSpeakerCollection: (
    speaker: string,
    collection: { collectionId: string; collectionName: string },
  ) => void;
}

// ============================================================================
// Combined Store
// ============================================================================

export interface ClippingWorkspaceStore {
  playback: PlaybackSlice;
  timeline: TimelineSlice;
  ui: UISlice;
  segments: SegmentsSlice;
}

// ============================================================================
// Slice Creator Type
// ============================================================================

export type SliceCreator<T> = StateCreator<
  ClippingWorkspaceStore,
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

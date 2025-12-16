import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";

// ============================================================================
// Types
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

export interface SpeakerMetadata {
  id: string;
  label: string;
  segmentCount: number;
  totalDuration: number;
  percentage: number;
  colorIndex: number;
}

// Alert types for segments
export type SegmentAlertType = "too_long" | "too_short" | "no_text";

// View mode
export type ViewMode = "table" | "focus";

// Speaker-to-collection mapping
export type SpeakerCollections = Record<
  string,
  { collectionId: string; collectionName: string }
>;

// Sort configuration
export interface SortConfig {
  column: "duration" | "reviewed" | "alerts";
  direction: "asc" | "desc";
}

// Filter configuration
export interface FilterConfig {
  alerts: SegmentAlertType[];
  reviewed: boolean | null; // null = all, true = reviewed only, false = unreviewed only
  search: string;
}

// Audio slice
interface AudioState {
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
}

interface AudioActions {
  setIsPlaying: (isPlaying: boolean) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentTime: (time: number) => void;
}

// Timeline slice
interface TimelineState {
  zoomLevel: number;
  containerWidth: number;
}

interface TimelineActions {
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setContainerWidth: (width: number) => void;
}

// Workspace slice
interface WorkspaceState {
  // Diarization metadata
  diarizationId: string;
  projectId: string;
  fileName: string;
  // Segments and speaker mappings
  segmentsById: Record<string, SegmentWithId>;
  speakerCollections: SpeakerCollections;
  // Selection state
  selectedSpeaker: string | null;
  selectedSegmentId: string | null;
  selectedSegmentIds: Set<string>;
  // View state
  viewMode: ViewMode;
  sortBy: SortConfig | null;
  filters: FilterConfig;
}

interface WorkspaceActions {
  selectSpeaker: (speaker: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
  // View mode
  setViewMode: (mode: ViewMode) => void;
  // Multi-select
  toggleSegmentSelection: (segmentId: string) => void;
  selectAllSegments: () => void;
  clearSelection: () => void;
  setSelectedSegmentIds: (ids: Set<string>) => void;
  // Sorting & Filtering
  setSortBy: (config: SortConfig | null) => void;
  setFilters: (filters: Partial<FilterConfig>) => void;
  clearFilters: () => void;
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

// Combined store
export interface ClippingWorkspaceState
  extends AudioState,
    TimelineState,
    WorkspaceState {}

export interface ClippingWorkspaceActions
  extends AudioActions,
    TimelineActions,
    WorkspaceActions {}

export type ClippingWorkspaceStore = ClippingWorkspaceState &
  ClippingWorkspaceActions;

// ============================================================================
// Constants
// ============================================================================

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const DEFAULT_ZOOM = 100;
const DEFAULT_CONTAINER_WIDTH = 800;

// ============================================================================
// Initial State Factory
// ============================================================================

// Diarization data from tRPC query
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

export interface ClippingWorkspaceStoreInitialData {
  diarization: DiarizationData;
}

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

export function createClippingWorkspaceStore(
  initialData: ClippingWorkspaceStoreInitialData,
) {
  const { diarization } = initialData;
  const segmentsById = createSegmentsWithIds(diarization.output?.segments ?? []);
  const speakerCollections = diarization.speakerCollections ?? {};
  const fileName =
    diarization.file?.storageKey?.split("/").pop() ?? "Audio File";

  return createStore<ClippingWorkspaceStore>()(
    subscribeWithSelector(
      immer((set) => ({
        // Audio state
        isPlaying: false,
        duration: 0,
        playbackRate: 1,
        isLoading: true,
        error: null,
        currentTime: 0,

        // Audio actions
        setIsPlaying: (isPlaying) => set({ isPlaying }),
        setDuration: (duration) => set({ duration }),
        setPlaybackRate: (rate) => set({ playbackRate: rate }),
        setIsLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),
        setCurrentTime: (time) => set({ currentTime: time }),

        // Timeline state
        zoomLevel: DEFAULT_ZOOM,
        containerWidth: DEFAULT_CONTAINER_WIDTH,

        // Timeline actions
        setZoomLevel: (level) =>
          set({ zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) }),
        zoomIn: () =>
          set((state) => ({
            zoomLevel: Math.min(MAX_ZOOM, state.zoomLevel + 25),
          })),
        zoomOut: () =>
          set((state) => ({
            zoomLevel: Math.max(MIN_ZOOM, state.zoomLevel - 25),
          })),
        setContainerWidth: (width) => set({ containerWidth: width }),

        // Workspace state
        diarizationId: diarization.id,
        projectId: diarization.projectId,
        fileName: fileName,
        segmentsById: segmentsById,
        speakerCollections: speakerCollections,
        selectedSpeaker: null,
        selectedSegmentId: null,
        selectedSegmentIds: new Set<string>(),
        viewMode: "table" as ViewMode,
        sortBy: null,
        filters: {
          alerts: [],
          reviewed: null,
          search: "",
        },

        // Workspace actions
        selectSpeaker: (speaker) =>
          set({
            selectedSpeaker: speaker,
            selectedSegmentId: null,
            selectedSegmentIds: new Set(),
          }),
        selectSegment: (segmentId) =>
          set((state) => {
            if (!segmentId) {
              return { selectedSegmentId: null };
            }
            const segment = state.segmentsById[segmentId];
            if (segment && segment.speaker !== state.selectedSpeaker) {
              return {
                selectedSegmentId: segmentId,
                selectedSpeaker: segment.speaker,
              };
            }
            return { selectedSegmentId: segmentId };
          }),

        // View mode
        setViewMode: (mode) => set({ viewMode: mode }),

        // Multi-select
        toggleSegmentSelection: (segmentId) =>
          set((state) => {
            const newSet = new Set(state.selectedSegmentIds);
            if (newSet.has(segmentId)) {
              newSet.delete(segmentId);
            } else {
              newSet.add(segmentId);
            }
            return { selectedSegmentIds: newSet };
          }),
        selectAllSegments: () =>
          set((state) => {
            // Only select segments when a speaker is selected
            if (!state.selectedSpeaker) {
              return {};
            }
            const visibleSegmentIds = Object.values(state.segmentsById)
              .filter((s) => !s.isDeleted)
              .filter((s) => s.speaker === state.selectedSpeaker)
              .map((s) => s.id);
            return { selectedSegmentIds: new Set(visibleSegmentIds) };
          }),
        clearSelection: () => set({ selectedSegmentIds: new Set() }),
        setSelectedSegmentIds: (ids) => set({ selectedSegmentIds: ids }),

        // Sorting & Filtering
        setSortBy: (config) => set({ sortBy: config }),
        setFilters: (newFilters) =>
          set((state) => ({
            filters: { ...state.filters, ...newFilters },
          })),
        clearFilters: () =>
          set({
            filters: { alerts: [], reviewed: null, search: "" },
          }),

        // Segment mutations
        archiveSegment: (segmentId) =>
          set((state) => {
            const segment = state.segmentsById[segmentId];
            if (segment) {
              segment.isDeleted = true;
            }
            // Remove from selection if selected
            const newSelection = new Set(state.selectedSegmentIds);
            newSelection.delete(segmentId);
            return { selectedSegmentIds: newSelection };
          }),
        archiveSelectedSegments: () =>
          set((state) => {
            for (const segmentId of state.selectedSegmentIds) {
              const segment = state.segmentsById[segmentId];
              if (segment) {
                segment.isDeleted = true;
              }
            }
            return { selectedSegmentIds: new Set() };
          }),
        restoreSegment: (segmentId) =>
          set((state) => {
            const segment = state.segmentsById[segmentId];
            if (segment) {
              segment.isDeleted = false;
            }
          }),
        markAsReviewed: (segmentIds) =>
          set((state) => {
            for (const segmentId of segmentIds) {
              const segment = state.segmentsById[segmentId];
              if (segment) {
                segment.isReviewed = true;
              }
            }
          }),
        markAsUnreviewed: (segmentIds) =>
          set((state) => {
            for (const segmentId of segmentIds) {
              const segment = state.segmentsById[segmentId];
              if (segment) {
                segment.isReviewed = false;
              }
            }
          }),
        changeSpeaker: (segmentIds, newSpeaker) =>
          set((state) => {
            for (const segmentId of segmentIds) {
              const segment = state.segmentsById[segmentId];
              if (segment) {
                segment.speaker = newSpeaker;
              }
            }
          }),
        setSpeakerCollection: (speaker, collection) =>
          set((state) => {
            state.speakerCollections[speaker] = collection;
          }),
      })),
    ),
  );
}

export type ClippingWorkspaceStoreApi = ReturnType<
  typeof createClippingWorkspaceStore
>;

// ============================================================================
// Constants Export (for selectors)
// ============================================================================

export const TIMELINE_CONSTANTS = {
  BASE_TIMESPAN: 60,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
} as const;

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
}

export interface SpeakerMetadata {
  id: string;
  label: string;
  segmentCount: number;
  totalDuration: number;
  percentage: number;
  colorIndex: number;
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
  segmentsById: Record<string, SegmentWithId>;
  selectedSpeaker: string | null;
  selectedSegmentId: string | null;
}

interface WorkspaceActions {
  selectSpeaker: (speaker: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
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

export interface ClippingWorkspaceStoreInitialData {
  segments: DiarizationSegment[];
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
  const segmentsById = createSegmentsWithIds(initialData.segments);

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
        segmentsById: segmentsById,
        selectedSpeaker: null,
        selectedSegmentId: null,

        // Workspace actions
        selectSpeaker: (speaker) =>
          set({ selectedSpeaker: speaker, selectedSegmentId: null }),
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

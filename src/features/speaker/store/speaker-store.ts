import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { Clip, Speaker } from "~/server/db/schema";

// ============================================================================
// Types
// ============================================================================

/**
 * Segment with its associated clip and session info for media-proxy
 * Matches the type exported from the speaker tRPC router
 */
export interface SegmentWithClip {
  id: string;
  sessionId: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  transcription: string | null;
  clip: Clip | null;
  session: { fileStorageKey: string };
}

/**
 * Filter state for segments
 */
export interface SpeakerFilters {
  durationMin: number | null;
  durationMax: number | null;
  mosMin: number | null;
  mosMax: number | null;
  transcriptionStatus: "all" | "has" | "missing";
}

/**
 * Histogram bucket for distribution visualization
 */
export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  label: string;
}

/**
 * Histogram data for distribution charts
 */
export interface HistogramData {
  buckets: HistogramBucket[];
  min: number;
  max: number;
  bucketSize: number;
}

/**
 * Statistics for a speaker's segments
 */
export interface SpeakerStatistics {
  totalSegments: number;
  totalDuration: number;
  averageMos: number | null;
  mosDistribution: HistogramData;
  durationDistribution: HistogramData;
  transcriptionCoverage: number; // percentage 0-100
}

/**
 * Default filter values
 */
export const DEFAULT_FILTERS: SpeakerFilters = {
  durationMin: null,
  durationMax: null,
  mosMin: null,
  mosMax: null,
  transcriptionStatus: "all",
};

// ============================================================================
// Histogram Placeholder
// ============================================================================

/**
 * Placeholder histogram calculation - will be implemented in task 1.21
 * Returns an empty histogram structure
 */
function calculateHistogramPlaceholder(
  _values: number[],
  _bucketCount = 10,
): HistogramData {
  return {
    buckets: [],
    min: 0,
    max: 0,
    bucketSize: 0,
  };
}

// ============================================================================
// Store State Interface
// ============================================================================

export interface SpeakerPageStoreState {
  // Core data
  speakerId: string;
  projectId: string;
  speaker: Speaker;
  segments: SegmentWithClip[];

  // Filter state
  filters: SpeakerFilters;

  // Selection state
  selectedSegmentIds: Set<string>;

  // Computed values
  filteredSegments: () => SegmentWithClip[];
  statistics: () => SpeakerStatistics;

  // Actions
  setFilter: <K extends keyof SpeakerFilters>(
    key: K,
    value: SpeakerFilters[K],
  ) => void;
  clearFilters: () => void;
  toggleSegmentSelection: (segmentId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  updateTranscription: (segmentId: string, text: string) => void;
}

export type $SpeakerPageStore = Observable<SpeakerPageStoreState>;

// ============================================================================
// Initial Data Type
// ============================================================================

export interface SpeakerPageStoreInitialData {
  speakerId: string;
  projectId: string;
  speaker: Speaker;
  segments: SegmentWithClip[];
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Creates the speaker page store observable.
 * Must be called from a React component (the provider).
 * Uses useObservable which returns a stable observable across renders.
 */
export function createSpeakerPageStore(
  initialData: SpeakerPageStoreInitialData,
): $SpeakerPageStore {
  const $store = useObservable<SpeakerPageStoreState>({
    // Core data
    speakerId: initialData.speakerId,
    projectId: initialData.projectId,
    speaker: initialData.speaker,
    segments: initialData.segments,

    // Filter state
    filters: { ...DEFAULT_FILTERS },

    // Selection state
    selectedSegmentIds: new Set<string>(),

    // Computed: filtered segments based on current filters
    filteredSegments: () => {
      const segments = $store.segments.get();
      const filters = $store.filters.get();

      return segments.filter((segment) => {
        const duration = segment.endTime - segment.startTime;

        // Duration min filter
        if (filters.durationMin !== null && duration < filters.durationMin) {
          return false;
        }

        // Duration max filter
        if (filters.durationMax !== null && duration > filters.durationMax) {
          return false;
        }

        // MOS min filter (only applies if clip exists with MOS score)
        if (filters.mosMin !== null) {
          if (
            !segment.clip?.mosScore ||
            segment.clip.mosScore < filters.mosMin
          ) {
            return false;
          }
        }

        // MOS max filter (only applies if clip exists with MOS score)
        if (filters.mosMax !== null) {
          if (
            !segment.clip?.mosScore ||
            segment.clip.mosScore > filters.mosMax
          ) {
            return false;
          }
        }

        // Transcription status filter
        if (filters.transcriptionStatus === "has" && !segment.transcription) {
          return false;
        }
        if (
          filters.transcriptionStatus === "missing" &&
          segment.transcription
        ) {
          return false;
        }

        return true;
      });
    },

    // Computed: statistics for current segments
    statistics: () => {
      const segments = $store.segments.get();

      // Calculate total segments
      const totalSegments = segments.length;

      // Calculate total duration
      const totalDuration = segments.reduce(
        (sum, seg) => sum + (seg.endTime - seg.startTime),
        0,
      );

      // Calculate average MOS (only for clips with scores)
      const mosScores = segments
        .map((seg) => seg.clip?.mosScore)
        .filter(
          (score): score is number => score !== null && score !== undefined,
        );

      const averageMos =
        mosScores.length > 0
          ? mosScores.reduce((sum, score) => sum + score, 0) / mosScores.length
          : null;

      // Calculate duration distribution
      const durations = segments.map((seg) => seg.endTime - seg.startTime);
      const durationDistribution = calculateHistogramPlaceholder(durations, 10);

      // Calculate MOS distribution
      const mosDistribution = calculateHistogramPlaceholder(mosScores, 10);

      // Calculate transcription coverage
      const segmentsWithTranscription = segments.filter(
        (seg) => seg.transcription !== null && seg.transcription !== "",
      ).length;
      const transcriptionCoverage =
        totalSegments > 0
          ? (segmentsWithTranscription / totalSegments) * 100
          : 0;

      return {
        totalSegments,
        totalDuration,
        averageMos,
        mosDistribution,
        durationDistribution,
        transcriptionCoverage,
      };
    },

    // Actions
    setFilter: <K extends keyof SpeakerFilters>(
      key: K,
      value: SpeakerFilters[K],
    ) => {
      // Use spread to update the specific filter key
      // This avoids TypeScript's limitation with generic indexed access on observables
      $store.filters.set({ ...$store.filters.peek(), [key]: value });
    },

    clearFilters: () => {
      $store.filters.set({ ...DEFAULT_FILTERS });
    },

    toggleSegmentSelection: (segmentId: string) => {
      if ($store.selectedSegmentIds.has(segmentId)) {
        $store.selectedSegmentIds.delete(segmentId);
      } else {
        $store.selectedSegmentIds.add(segmentId);
      }
    },

    selectAll: () => {
      const filteredSegments = $store.filteredSegments();
      const allIds = filteredSegments.map((seg) => seg.id);
      $store.selectedSegmentIds.set(new Set(allIds));
    },

    clearSelection: () => {
      $store.selectedSegmentIds.clear();
    },

    updateTranscription: (segmentId: string, text: string) => {
      const segments = $store.segments.peek();
      const index = segments.findIndex((seg) => seg.id === segmentId);
      if (index !== -1) {
        const segment = $store.segments[index];
        segment?.transcription.set(text);
      }
    },
  }) as $SpeakerPageStore;

  return $store;
}

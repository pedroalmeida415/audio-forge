import { batch, type Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { Clip, File, Segment, Speaker } from "~/server/db/schema";

// ============================================================================
// Types
// ============================================================================

export type SegmentWithClip = Segment & {
  clip:
    | (Clip & {
        file: Pick<File, "storageKey" | "duration">;
      })
    | null;
  session: {
    id: string;
    name: string | null;
    file: Pick<File, "name" | "storageKey">;
  };
};

export interface SpeakerStats {
  totalSegments: number;
  totalDuration: number;
  clipsCount: number;
  transcribedCount: number;
  avgScore: number | null;
}

export interface FilterState {
  hasClip: boolean | null;
  hasTranscription: boolean | null;
  minDuration: number;
  maxDuration: number;
  minScore: number;
  selectedTag: string | null;
}

export const DEFAULT_FILTERS: FilterState = {
  hasClip: null,
  hasTranscription: null,
  minDuration: 0,
  maxDuration: 30,
  minScore: 0,
  selectedTag: null,
};

// ============================================================================
// State Types
// ============================================================================

export type SpeakerPageStateData = {
  projectId: string;
  speakerId: string;
  speaker: Speaker;
  stats: SpeakerStats;
  segments: SegmentWithClip[];
  selectedSegmentIds: Set<string>;
  pendingSegmentIds: Set<string>;
  hasMore: boolean;
  isLoadingMore: boolean;
  nextCursor: string | undefined;
  filters: FilterState;
};

export type SpeakerPageInitialData = Pick<
  SpeakerPageStateData,
  "projectId" | "speakerId" | "speaker" | "stats"
> & {
  initialSegments: SegmentWithClip[];
  hasMore: boolean;
  nextCursor: string | undefined;
};

// ============================================================================
// Filter Helper
// ============================================================================

function applyFilters(
  segments: SegmentWithClip[],
  filters: FilterState,
): SegmentWithClip[] {
  return segments.filter((seg) => {
    // Clip status filter
    if (filters.hasClip !== null) {
      const hasClip = seg.clip !== null;
      if (hasClip !== filters.hasClip) return false;
    }

    // Transcription filter
    if (filters.hasTranscription !== null) {
      const hasTranscription =
        seg.transcription !== null && seg.transcription.trim() !== "";
      if (hasTranscription !== filters.hasTranscription) return false;
    }

    // Duration filter
    const duration = seg.endTime - seg.startTime;
    if (duration < filters.minDuration || duration > filters.maxDuration) {
      return false;
    }

    // Score filter (only filter if segment has a score)
    if (filters.minScore > 0 && seg.score !== null) {
      if (seg.score < filters.minScore) return false;
    }

    // Tag filter
    if (filters.selectedTag !== null) {
      if (!seg.tags?.includes(filters.selectedTag)) return false;
    }

    return true;
  });
}

// ============================================================================
// Store Factory
// ============================================================================

export function createSpeakerPageStore(initialData: SpeakerPageInitialData) {
  const $store = useObservable<SpeakerPageStoreState>({
    // State
    projectId: initialData.projectId,
    speakerId: initialData.speakerId,
    speaker: initialData.speaker,
    stats: initialData.stats,
    segments: initialData.initialSegments,
    selectedSegmentIds: new Set<string>(),
    pendingSegmentIds: new Set<string>(),
    hasMore: initialData.hasMore,
    isLoadingMore: false,
    nextCursor: initialData.nextCursor,
    filters: { ...DEFAULT_FILTERS },

    // Actions
    toggleSelection: (segmentId: string) => {
      if ($store.selectedSegmentIds.has(segmentId)) {
        $store.selectedSegmentIds.delete(segmentId);
      } else {
        $store.selectedSegmentIds.add(segmentId);
      }
    },

    selectAll: () => {
      // Select all filtered segments
      const filtered = applyFilters(
        $store.segments.peek(),
        $store.filters.peek(),
      );
      $store.selectedSegmentIds.set(new Set(filtered.map((s) => s.id)));
    },

    clearSelection: () => {
      $store.selectedSegmentIds.clear();
    },

    appendSegments: (newSegments: SegmentWithClip[]) => {
      batch(() => {
        const current = $store.segments.peek();
        $store.segments.set([...current, ...newSegments]);
      });
    },

    updateTranscription: (segmentId: string, transcription: string | null) => {
      const index = $store.segments.peek().findIndex((s) => s.id === segmentId);
      if (index !== -1) {
        $store.segments[index]?.transcription.set(transcription);
      }
    },

    setHasMore: (hasMore: boolean) => {
      $store.hasMore.set(hasMore);
    },

    setIsLoadingMore: (isLoading: boolean) => {
      $store.isLoadingMore.set(isLoading);
    },

    setNextCursor: (cursor: string | undefined) => {
      $store.nextCursor.set(cursor);
    },

    updateStats: (stats: Partial<SpeakerStats>) => {
      $store.stats.assign(stats);
    },

    markSegmentsPending: (segmentIds: string[]) => {
      const current = $store.pendingSegmentIds.peek();
      const updated = new Set([...current, ...segmentIds]);
      $store.pendingSegmentIds.set(updated);
    },

    markSegmentComplete: (segmentId: string) => {
      $store.pendingSegmentIds.delete(segmentId);
    },

    updateSegmentClip: (segmentId: string, clip: SegmentWithClip["clip"]) => {
      const index = $store.segments.peek().findIndex((s) => s.id === segmentId);
      if (index !== -1) {
        $store.segments[index]?.clip.set(clip);
      }
    },

    setFilters: (updates: Partial<FilterState>) => {
      $store.filters.assign(updates);
    },

    resetFilters: () => {
      $store.filters.set({ ...DEFAULT_FILTERS });
    },

    updateSegmentTags: (segmentId: string, tags: string[]) => {
      const index = $store.segments.peek().findIndex((s) => s.id === segmentId);
      if (index !== -1) {
        $store.segments[index]?.tags.set(tags);
      }
    },

    getFilteredSegments: () => {
      return applyFilters($store.segments.peek(), $store.filters.peek());
    },

    getAllTags: () => {
      const allTags = new Set<string>();
      for (const seg of $store.segments.peek()) {
        if (seg.tags) {
          for (const tag of seg.tags) {
            allTags.add(tag);
          }
        }
      }
      return Array.from(allTags).sort();
    },
  }) as $SpeakerPageStore;

  return $store;
}

// ============================================================================
// Store Interface
// ============================================================================

interface SpeakerPageStoreState extends SpeakerPageStateData {
  // Actions
  toggleSelection: (segmentId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  appendSegments: (newSegments: SegmentWithClip[]) => void;
  updateTranscription: (
    segmentId: string,
    transcription: string | null,
  ) => void;
  setHasMore: (hasMore: boolean) => void;
  setIsLoadingMore: (isLoading: boolean) => void;
  setNextCursor: (cursor: string | undefined) => void;
  updateStats: (stats: Partial<SpeakerStats>) => void;
  markSegmentsPending: (segmentIds: string[]) => void;
  markSegmentComplete: (segmentId: string) => void;
  updateSegmentClip: (segmentId: string, clip: SegmentWithClip["clip"]) => void;
  setFilters: (updates: Partial<FilterState>) => void;
  resetFilters: () => void;
  updateSegmentTags: (segmentId: string, tags: string[]) => void;
  getFilteredSegments: () => SegmentWithClip[];
  getAllTags: () => string[];
}

export type $SpeakerPageStore = Observable<SpeakerPageStoreState>;

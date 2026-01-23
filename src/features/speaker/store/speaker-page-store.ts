import { batch, type Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { Clip, File, Segment, Speaker } from "~/server/db/schema";

// ============================================================================
// Types
// ============================================================================

export type SegmentWithClip = Segment & {
  clip:
    | (Clip & {
        file: File;
      })
    | null;
  session: {
    id: string;
    name: string | null;
    file: File;
  };
};

export interface SpeakerStats {
  totalSegments: number;
  totalDuration: number;
  clipsCount: number;
  transcribedCount: number;
}

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

    // Actions
    toggleSelection: (segmentId: string) => {
      if ($store.selectedSegmentIds.has(segmentId)) {
        $store.selectedSegmentIds.delete(segmentId);
      } else {
        $store.selectedSegmentIds.add(segmentId);
      }
    },

    selectAll: () => {
      const allIds = $store.segments.peek().map((s) => s.id);
      $store.selectedSegmentIds.set(new Set(allIds));
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
}

export type $SpeakerPageStore = Observable<SpeakerPageStoreState>;

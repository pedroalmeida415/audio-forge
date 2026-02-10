import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { Clip, Segment, Speaker } from "~/server/db/schema";

// ============================================================================
// Types
// ============================================================================

export type SegmentWithClip = Segment & {
  clip: Clip | null;
  source: {
    id: string;
    name: string | null;
    storageKey: string | null;
  };
};

export type SegmentEntryStatus = "pending" | "loading" | "loaded" | "error";

export type SegmentEntry = {
  status: SegmentEntryStatus;
  data: SegmentWithClip | null;
  error?: string;
};

// ============================================================================
// State Types
// ============================================================================

export type SpeakerPageStateData = {
  speaker: Speaker;
  // Unified segments map (preserves insertion order)
  segments: Map<string, SegmentEntry>;
  // Selection
  selectedSegmentIds: Set<string>;
  // Clip processing state
  clipPendingIds: Set<string>;
};

export type SpeakerPageInitialData = Pick<SpeakerPageStateData, "speaker"> & {
  segmentIds: string[];
};

// ============================================================================
// Store Factory
// ============================================================================

export function createSpeakerPageStore(initialData: SpeakerPageInitialData) {
  const { speaker, segmentIds } = initialData;

  const $store = useObservable<SpeakerPageStoreState>({
    // State
    speaker: speaker,
    segments: new Map(
      segmentIds.map((id) => [
        id,
        { status: "pending", data: null, error: undefined },
      ]),
    ),
    selectedSegmentIds: new Set<string>(),
    clipPendingIds: new Set<string>(),

    // Actions - Segments fetching
    markSegmentsLoading: (ids: string[]) => {
      for (const id of ids) {
        const entry = $store.segments.get(id);
        if (entry.status.peek() === "pending") {
          entry.status.set("loading");
        }
      }
    },

    setSegmentData: (segments: SegmentWithClip[]) => {
      for (const seg of segments) {
        $store.segments.set(seg.id, { status: "loaded", data: seg });
      }
    },

    markSegmentsError: (ids: string[]) => {
      for (const id of ids) {
        $store.segments.get(id).status.set("error");
      }
    },

    // Actions - Selection
    toggleSelection: (segmentId: string) => {
      if ($store.selectedSegmentIds.has(segmentId)) {
        $store.selectedSegmentIds.delete(segmentId);
      } else {
        $store.selectedSegmentIds.add(segmentId);
      }
    },

    selectAll: () => {
      for (const id of $store.segments.keys()) {
        $store.selectedSegmentIds.add(id);
      }
    },

    clearSelection: () => {
      $store.selectedSegmentIds.clear();
    },

    // Actions - Segment updates
    updateTranscription: (segmentId: string, transcription: string | null) => {
      const entry = $store.segments.get(segmentId);
      if (entry.data.peek()) {
        entry.data.transcription.set(transcription);
      }
    },

    updateSegmentClip: (segmentId: string, clip: SegmentWithClip["clip"]) => {
      const entry = $store.segments.get(segmentId);
      if (entry.data.peek()) {
        entry.data.clip.set(clip);
      }
    },

    updateSegmentTags: (segmentId: string, tags: string[]) => {
      const entry = $store.segments.get(segmentId);
      if (entry.data.peek()) {
        entry.data.tags.set(tags);
      }
    },

    // Actions - Clip processing state
    markClipsPending: (segmentIds: string[]) => {
      for (const id of segmentIds) {
        $store.clipPendingIds.add(id);
      }
    },

    markClipComplete: (segmentId: string) => {
      $store.clipPendingIds.delete(segmentId);
    },

    // Actions - Segment removal
    removeSegments: (ids: string[]) => {
      for (const id of ids) {
        $store.segments.delete(id);
        $store.selectedSegmentIds.delete(id);
        $store.clipPendingIds.delete(id);
      }
    },
  }) as $SpeakerPageStore;

  return $store;
}

// ============================================================================
// Store Interface
// ============================================================================

interface SpeakerPageStoreState extends SpeakerPageStateData {
  // Segments fetching
  markSegmentsLoading: (ids: string[]) => void;
  setSegmentData: (segments: SegmentWithClip[]) => void;
  markSegmentsError: (ids: string[]) => void;

  // Selection
  toggleSelection: (segmentId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Segment updates
  updateTranscription: (
    segmentId: string,
    transcription: string | null,
  ) => void;
  updateSegmentClip: (segmentId: string, clip: SegmentWithClip["clip"]) => void;
  updateSegmentTags: (segmentId: string, tags: string[]) => void;

  // Clip processing state
  markClipsPending: (segmentIds: string[]) => void;
  markClipComplete: (segmentId: string) => void;

  // Segment removal
  removeSegments: (ids: string[]) => void;
}

export type $SpeakerPageStore = Observable<SpeakerPageStoreState>;

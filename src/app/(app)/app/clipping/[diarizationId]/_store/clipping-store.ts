import { batch, type Observable, ObservableHint } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { createSpeakerColorMap } from "~/lib/speaker-colors";
import type { Diarization, DiarizationSegment } from "~/server/db/schema";
import { api } from "~/trpc/react";

import { setupMutationDefaults } from "./mutations";
import {
  createPlaybackState,
  createSelectionState,
  createTimelineState,
} from "./slices";
import type { PlaybackState } from "./slices/playback";
import type { SelectionState } from "./slices/selection";
import type { TimelineState } from "./slices/timeline";

export { TIMELINE_CONSTANTS } from "./constants";

export interface ClippingStoreInitialData {
  diarization: Diarization;
  audioDataBuffer: ArrayBuffer;
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Creates the clipping store observable.
 * Must be called from a React component (the provider).
 * Uses useObservable which returns a stable observable across renders.
 */
export function createClippingStore({
  audioDataBuffer,
  diarization,
}: ClippingStoreInitialData) {
  const segments = diarization.output?.segments ?? [];
  const speakerCollections =
    diarization.speakerCollections ?? ({} as SpeakerCollections);

  // Create the observable - closures capture $store by reference
  // This works because closures capture variables by reference, not value.
  // When the functions are later called, $store will be assigned.
  const $store = useObservable<ClippingStoreState>({
    // Core data
    diarizationId: diarization.id,
    projectId: diarization.projectId,

    segments,
    speakers: new Set(segments.map((s) => s.speaker)),
    speakerCollections,

    selectedSpeaker: null,
    selectedSegmentIds: new Set<string>(),
    activeSegmentId: null,

    audioDataBuffer: ObservableHint.opaque(audioDataBuffer),

    viewMode: "table",

    // Computed Values
    segmentsBySpeaker: () =>
      $store.segments.reduce(
        (acc, $segment) => {
          const segment = $segment.get();
          const speaker = segment.speaker;
          acc[speaker] ??= [];
          acc[speaker].push(segment);
          return acc;
        },
        {} as Record<string, DiarizationSegment[]>,
      ),

    // Actions
    selectSpeaker: (speaker: string | null) => {
      $store.selectedSpeaker.set(speaker);
      $store.selectedSegmentIds.clear();
    },

    toggleSelectSegment: (segmentId: string) => {
      const $selectedSegmentIds = $store.selectedSegmentIds;

      if ($selectedSegmentIds.has(segmentId)) {
        $selectedSegmentIds.delete(segmentId);
      } else {
        $selectedSegmentIds.add(segmentId);
      }

      $store.activeSegmentId.set(null);
    },

    selectAllSegments: () => {
      const selectedSpeaker = $store.selectedSpeaker.peek();
      if (!selectedSpeaker) return;
      const speakerSegments = $store.segmentsBySpeaker.get()[selectedSpeaker]!

      const visibleSegmentIds = speakerSegments
        .filter((s) => !s.isDeleted && s.speaker === selectedSpeaker)
        .map((s) => s.id);

      $store.selectedSegmentIds.set(new Set(visibleSegmentIds));
      $store.activeSegmentId.set(null);
    },

    clearAllSelected: () => {
      $store.selectedSegmentIds.clear();
      $store.activeSegmentId.set(null);
    },

    setActiveSegment: (segmentId: string | null) => {
      const segment = $store.segments.peek().find((s) => s.id === segmentId);
      const currentSpeaker = $store.selectedSpeaker.peek();

      batch(() => {
        $store.activeSegmentId.set(segmentId);
        if (segment && segment.speaker !== currentSpeaker) {
          $store.selectedSpeaker.set(segment.speaker);
        }
      });
    },

    // Combined selection + scroll actions
    selectSegment: (segmentId: string) => {
      $store.setActiveSegment(segmentId);
      const segment = $store.segments.peek().find((s) => s.id === segmentId);
      if (segment) {
        $store.playback.scrollToTime(segment.start);
      }
    },

    navigateSegment: (direction: "next" | "prev") => {
      const activeSegmentId = $store.activeSegmentId.peek();
      const selectedSpeaker = $store.selectedSpeaker.peek();
      const segments = $store.segments.peek();

      // Filter segments by speaker and non-deleted
      const filteredSegments = selectedSpeaker
        ? segments.filter((s) => s.speaker === selectedSpeaker && !s.isDeleted)
        : segments.filter((s) => !s.isDeleted);

      // Sort by start time
      filteredSegments.sort((a, b) => a.start - b.start);

      if (!activeSegmentId) {
        const nextSegment =
          direction === "next" ? filteredSegments[0] : undefined;
        if (nextSegment) {
          $store.selectSegment(nextSegment.id);
        }
        return;
      }

      const currentIndex = filteredSegments.findIndex(
        (s) => s.id === activeSegmentId,
      );
      if (currentIndex === -1) return;

      const newIndex =
        direction === "next" ? currentIndex + 1 : currentIndex - 1;
      const segment = filteredSegments[newIndex];

      if (segment) {
        $store.selectSegment(segment.id);
      }
    },

    // Computed values
    speakerColors: () => {
      return createSpeakerColorMap($store.speakers.peek());
    },

    // Playback state + actions
    playback: createPlaybackState(() => $store),

    // Timeline state + actions
    timeline: createTimelineState(() => $store),

    // Selection state for click-and-drag segment creation
    selection: createSelectionState(() => $store),
  }) as $ClippingStore;

  const trpcUtils = api.useUtils();

  // Set up mutation defaults for optimistic updates
  setupMutationDefaults(() => $store, trpcUtils);

  return $store;
}

export type SpeakerCollections = NonNullable<Diarization["speakerCollections"]>;

interface ClippingStoreState {
  // Core data
  diarizationId: string;
  projectId: string;

  segments: DiarizationSegment[];
  speakers: Set<string>;
  speakerCollections: SpeakerCollections;

  selectedSpeaker: string | null;
  selectedSegmentIds: Set<string>;
  activeSegmentId: string | null;

  audioDataBuffer: ArrayBuffer;

  viewMode: "table" | "focus";

  // Computed values
  segmentsBySpeaker: () => Record<string, DiarizationSegment[]>;
  speakerColors: () => Record<string, string>;

  selectSpeaker: (speaker: string | null) => void;
  toggleSelectSegment: (segmentId: string) => void;
  selectAllSegments: () => void;
  clearAllSelected: () => void;
  setActiveSegment: (segmentId: string | null) => void;

  // Combined selection + scroll actions
  selectSegment: (segmentId: string) => void;
  navigateSegment: (direction: "next" | "prev") => void;

  // State slices
  playback: PlaybackState;
  timeline: TimelineState;
  selection: SelectionState;
}

export type $ClippingStore = Observable<ClippingStoreState>;

import { batch, type Observable, ObservableHint } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { createSpeakerColorMap } from "~/lib/speaker-colors";
import type { Segment, Speaker } from "~/server/db/schema";
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

// Extended segment type with speaker info (returned by getById)
export interface SegmentWithSpeaker extends Segment {
  speaker: Speaker;
}

export interface ClippingStoreInitialData {
  session: {
    id: string;
    fileId: string;
    projectId: string;
    segments: SegmentWithSpeaker[];
    speakers: Speaker[];
  };
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
  session,
}: ClippingStoreInitialData) {
  const segments = session.segments;
  const speakers = session.speakers;

  // Create the observable - closures capture $store by reference
  // This works because closures capture variables by reference, not value.
  // When the functions are later called, $store will be assigned.
  const $store = useObservable<ClippingStoreState>({
    // Core data
    sessionId: session.id,
    fileId: session.fileId,
    projectId: session.projectId,

    segments,
    speakers,

    selectedSpeakerId: null,
    selectedSegmentIds: new Set<string>(),
    activeSegmentId: null,

    audioDataBuffer: ObservableHint.opaque(audioDataBuffer),

    // Computed Values
    segmentsBySpeaker: () =>
      $store.segments.reduce(
        (acc, $segment) => {
          const segment = $segment.get();
          const speakerId = segment.speakerId;
          acc[speakerId] ??= [];
          acc[speakerId].push(segment);
          return acc;
        },
        {} as Record<string, SegmentWithSpeaker[]>,
      ),

    // Actions
    selectSpeaker: (speakerId: string | null) => {
      $store.selectedSpeakerId.set(speakerId);
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
      const selectedSpeakerId = $store.selectedSpeakerId.peek();
      if (!selectedSpeakerId) return;
      const speakerSegments =
        $store.segmentsBySpeaker.get()[selectedSpeakerId] ?? [];

      const visibleSegmentIds = speakerSegments
        .filter((s) => s.speakerId === selectedSpeakerId)
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
      const currentSpeakerId = $store.selectedSpeakerId.peek();

      batch(() => {
        $store.activeSegmentId.set(segmentId);
        if (segment && segment.speakerId !== currentSpeakerId) {
          $store.selectedSpeakerId.set(segment.speakerId);
        }
      });
    },

    // Combined selection + scroll actions
    selectSegment: (segmentId: string) => {
      $store.setActiveSegment(segmentId);
      const segment = $store.segments.peek().find((s) => s.id === segmentId);
      if (segment) {
        $store.playback.scrollToTime(segment.startTime);
      }
    },

    navigateSegment: (direction: "next" | "prev") => {
      const activeSegmentId = $store.activeSegmentId.peek();
      const selectedSpeakerId = $store.selectedSpeakerId.peek();
      const segments = $store.segments.peek();

      // Filter segments by speaker
      const filteredSegments = selectedSpeakerId
        ? segments.filter((s) => s.speakerId === selectedSpeakerId)
        : [...segments];

      // Sort by start time
      filteredSegments.sort((a, b) => a.startTime - b.startTime);

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

    // Replace session data with server state (used when diarization completes)
    replaceSessionData: (
      newSegments: SegmentWithSpeaker[],
      newSpeakers: Speaker[],
    ) => {
      batch(() => {
        $store.segments.set(newSegments);
        $store.speakers.set(newSpeakers);
        // Reset selection state since segments changed
        $store.selectedSpeakerId.set(null);
        $store.selectedSegmentIds.clear();
        $store.activeSegmentId.set(null);
      });
    },

    // Speaker CRUD actions (optimistic updates handled by mutations.ts)
    addSpeaker: (speaker: Speaker) => {
      $store.speakers.push(speaker);
    },

    updateSpeaker: (speakerId: string, updates: Partial<Speaker>) => {
      const index = $store.speakers.peek().findIndex((s) => s.id === speakerId);
      if (index !== -1) {
        $store.speakers[index]?.assign(updates);
      }
    },

    removeSpeaker: (speakerId: string) => {
      const index = $store.speakers.peek().findIndex((s) => s.id === speakerId);
      if (index !== -1) {
        $store.speakers.splice(index, 1);
      }
    },

    // Computed values
    speakerColors: () => {
      return createSpeakerColorMap($store.speakers.get());
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

interface ClippingStoreState {
  // Core data
  sessionId: string;
  fileId: string;
  projectId: string;

  segments: SegmentWithSpeaker[];
  speakers: Speaker[];

  selectedSpeakerId: string | null;
  selectedSegmentIds: Set<string>;
  activeSegmentId: string | null;

  audioDataBuffer: ArrayBuffer;

  // Computed values
  segmentsBySpeaker: () => Record<string, SegmentWithSpeaker[]>;
  speakerColors: () => Record<string, string>;

  // Speaker selection
  selectSpeaker: (speakerId: string | null) => void;
  toggleSelectSegment: (segmentId: string) => void;
  selectAllSegments: () => void;
  clearAllSelected: () => void;
  setActiveSegment: (segmentId: string | null) => void;

  // Combined selection + scroll actions
  selectSegment: (segmentId: string) => void;
  navigateSegment: (direction: "next" | "prev") => void;

  // Replace session data with server state (for diarization completion)
  replaceSessionData: (
    segments: SegmentWithSpeaker[],
    speakers: Speaker[],
  ) => void;

  // Speaker CRUD
  addSpeaker: (speaker: Speaker) => void;
  updateSpeaker: (speakerId: string, updates: Partial<Speaker>) => void;
  removeSpeaker: (speakerId: string) => void;

  // State slices
  playback: PlaybackState;
  timeline: TimelineState;
  selection: SelectionState;
}

export type $ClippingStore = Observable<ClippingStoreState>;

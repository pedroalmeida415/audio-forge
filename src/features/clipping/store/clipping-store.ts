import { batch, type Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { SegmentWithSource, SpeakerWithSource } from "~/server/db/schema";
import { api } from "~/trpc/react";

import { setupMutationDefaults } from "./mutations";
import {
  createPlaybackState,
  createSelectionState,
  createTimelineState,
} from "./slices";
import type { PlaybackState, PlaybackStateData } from "./slices/playback";
import type { SelectionState, SelectionStateData } from "./slices/selection";
import type { TimelineState, TimelineStateData } from "./slices/timeline";

export { TIMELINE_CONSTANTS } from "./constants";

// ============================================================================
// State Types
// ============================================================================

/**
 * Root-level state data (non-function properties).
 */
export type RootStateData = Pick<
  ClippingStoreState,
  | "sessionId"
  | "fileId"
  | "projectId"
  | "segments"
  | "speakers"
  | "storageKey"
  | "selectedSpeakerId"
  | "selectedSegmentIds"
  | "activeSegmentId"
>;

/**
 * Default values for optional root state.
 */
const ROOT_DEFAULTS: Pick<
  RootStateData,
  "selectedSpeakerId" | "selectedSegmentIds" | "activeSegmentId"
> = {
  selectedSpeakerId: null,
  selectedSegmentIds: new Set<string>(),
  activeSegmentId: null,
};

/**
 * Initial data for the clipping store.
 * Required: core data fields (sessionId, fileId, etc).
 * Optional: UI state and slice state overrides.
 */
export type ClippingStoreInitialData = Pick<
  RootStateData,
  "sessionId" | "fileId" | "projectId" | "segments" | "speakers" | "storageKey"
> &
  Partial<
    Pick<
      RootStateData,
      "selectedSpeakerId" | "selectedSegmentIds" | "activeSegmentId"
    >
  > & { playback?: Partial<PlaybackStateData> } & {
    timeline?: Partial<TimelineStateData>;
  } & { selection?: Partial<SelectionStateData> };

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Creates the clipping store observable.
 * Must be called from a React component (the provider).
 * Uses useObservable which returns a stable observable across renders.
 */
export function createClippingStore(initialData: ClippingStoreInitialData) {
  // Destructure slice overrides from root state
  const { playback, timeline, selection, ...rootInitialData } = initialData;

  // Merge defaults with initial data (excluding slices)
  const rootState: RootStateData = { ...ROOT_DEFAULTS, ...rootInitialData };

  // Create the observable - closures capture $store by reference
  // This works because closures capture variables by reference, not value.
  // When the functions are later called, $store will be assigned.
  const $store = useObservable<ClippingStoreState>({
    // State (defaults merged with initial data)
    ...rootState,

    // Computed Values
    // Note: uses .get() for speakerId to track changes when segments are reassigned
    segmentsBySpeaker: () =>
      $store.segments.reduce(
        (acc, $segment) => {
          const speakerId = $segment.speakerId.get();
          if (acc.has(speakerId)) acc.get(speakerId)?.push($segment);
          else acc.set(speakerId, [$segment]);

          return acc;
        },
        new Map() as Map<string, Observable<SegmentWithSource>[]>,
      ),

    // Actions
    selectSpeaker: (speakerId: string | null) => {
      $store.selectedSpeakerId.set(speakerId);
      $store.selectedSegmentIds.clear();
    },

    toggleSelectSegment: (segmentId: string) => {
      if ($store.selectedSegmentIds.has(segmentId)) {
        $store.selectedSegmentIds.delete(segmentId);
      } else {
        $store.selectedSegmentIds.add(segmentId);
      }

      $store.activeSegmentId.set(null);
    },

    selectAllSegments: () => {
      const selectedSpeakerId = $store.selectedSpeakerId.peek();
      if (!selectedSpeakerId) return;

      const speakerSegments =
        $store.segmentsBySpeaker.peek().get(selectedSpeakerId) ?? [];

      const visibleSegmentIds = speakerSegments.map(($s) => $s.id.peek());

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
      newSegments: SegmentWithSource[],
      newSpeakers: SpeakerWithSource[],
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
    addSpeaker: (speaker: SpeakerWithSource) => {
      $store.speakers.push(speaker);
    },

    updateSpeaker: (speakerId: string, updates: Partial<SpeakerWithSource>) => {
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

    // Playback state + actions
    playback: createPlaybackState(() => $store, playback),

    // Timeline state + actions
    timeline: createTimelineState(() => $store, timeline),

    // Selection state for click-and-drag segment creation
    selection: createSelectionState(() => $store, selection),
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

  segments: SegmentWithSource[];
  speakers: SpeakerWithSource[];

  selectedSpeakerId: string | null;
  selectedSegmentIds: Set<string>;
  activeSegmentId: string | null;

  // Audio source info for MSE streaming
  storageKey: string;

  // Computed values
  segmentsBySpeaker: () => Map<string, Observable<SegmentWithSource>[]>;

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
    segments: SegmentWithSource[],
    speakers: SpeakerWithSource[],
  ) => void;

  // Speaker CRUD
  addSpeaker: (speaker: SpeakerWithSource) => void;
  updateSpeaker: (
    speakerId: string,
    updates: Partial<SpeakerWithSource>,
  ) => void;
  removeSpeaker: (speakerId: string) => void;

  // State slices
  playback: PlaybackState;
  timeline: TimelineState;
  selection: SelectionState;
}

export type $ClippingStore = Observable<ClippingStoreState>;

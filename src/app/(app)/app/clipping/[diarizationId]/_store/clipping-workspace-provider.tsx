"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  type ClippingWorkspaceInitialData,
  type ClippingWorkspaceStore,
  type ClippingWorkspaceStoreApi,
  createClippingWorkspaceStore,
} from "./clipping-workspace-store";
import { useContainerRef } from "./use-container-ref";
import { type PlaybackActions, usePlayback } from "./use-playback";

// ============================================================================
// Context
// ============================================================================

interface ClippingWorkspaceActions {
  // Playback actions (audio + timeline combined)
  playback: PlaybackActions;

  // Container ref
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Combined action handlers
  handleSegmentSelect: (segmentId: string) => void;
  handleTimelineSegmentClick: (segmentId: string) => void;
  handleSegmentPlay: (segmentId: string) => void;
  handleNavigateSegment: (direction: "next" | "prev") => void;
  handleScrubberDrag: (clientX: number, rect: DOMRect) => void;
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const ClippingWorkspaceStoreContext = createContext<
  | { store: ClippingWorkspaceStoreApi; actions: ClippingWorkspaceActions }
  | undefined
>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ClippingWorkspaceStoreProviderProps {
  children: ReactNode;
  initialData: ClippingWorkspaceInitialData;
}

export function ClippingWorkspaceStoreProvider({
  children,
  initialData,
}: ClippingWorkspaceStoreProviderProps) {
  const [store] = useState(() => createClippingWorkspaceStore(initialData));

  // Initialize ref hooks
  const playback = usePlayback(store);
  const containerRef = useContainerRef(store);

  // Combined handlers
  const handleSegmentSelect = useCallback(
    (segmentId: string) => {
      store.getState().selectSegment(segmentId);
      const segment = store.getState().segmentsById[segmentId];
      if (segment) {
        playback.scrollToTime(segment.start);
      }
    },
    [store, playback],
  );

  const handleTimelineSegmentClick = useCallback(
    (segmentId: string) => {
      store.getState().selectSegment(segmentId);
    },
    [store],
  );

  const handleSegmentPlay = useCallback(
    (segmentId: string) => {
      const segment = store.getState().segmentsById[segmentId];
      if (segment) {
        playback.playSegment(segment.start, segment.end);
        playback.scrollToTime(segment.start);
      }
    },
    [store, playback],
  );

  const handleNavigateSegment = useCallback(
    (direction: "next" | "prev") => {
      const state = store.getState();
      const { selectedSegmentId, selectedSpeaker, segmentsById } = state;
      const segments = Object.values(segmentsById);

      // Filter segments by speaker
      const filteredSegments = selectedSpeaker
        ? segments.filter((s) => s.speaker === selectedSpeaker)
        : segments;

      if (!selectedSegmentId) {
        const nextSegment =
          direction === "next" ? filteredSegments[0] : undefined;
        if (nextSegment) {
          state.selectSegment(nextSegment.id);
          playback.scrollToTime(nextSegment.start);
        }
        return;
      }

      const currentIndex = filteredSegments.findIndex(
        (s) => s.id === selectedSegmentId,
      );
      if (currentIndex === -1) return;

      const newIndex =
        direction === "next" ? currentIndex + 1 : currentIndex - 1;
      const segment = filteredSegments[newIndex];

      if (segment) {
        state.selectSegment(segment.id);
        playback.scrollToTime(segment.start);
      }
    },
    [store, playback],
  );

  const handleScrubberDrag = useCallback(
    (clientX: number, rect: DOMRect) => {
      const container = playback.scrollContainerRef.current;
      if (!container) return;

      const scrollLeft = container.scrollLeft;
      const relativeX = clientX - rect.left + scrollLeft;
      const time = playback.pixelsToTime(relativeX);
      const duration = store.getState().duration;
      const clampedTime = Math.max(0, Math.min(time, duration));
      playback.seek(clampedTime);
    },
    [store, playback],
  );

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;

      const container = playback.scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const relativeX = e.clientX - rect.left + scrollLeft;
      const time = playback.pixelsToTime(relativeX);
      const duration = store.getState().duration;
      const clampedTime = Math.max(0, Math.min(time, duration));
      playback.seek(clampedTime);
    },
    [store, playback],
  );

  return (
    <ClippingWorkspaceStoreContext.Provider
      value={{
        store,
        actions: {
          playback,
          containerRef,
          handleSegmentSelect,
          handleTimelineSegmentClick,
          handleSegmentPlay,
          handleNavigateSegment,
          handleScrubberDrag,
          handleTimelineClick,
        },
      }}
    >
      {children}
    </ClippingWorkspaceStoreContext.Provider>
  );
}

// ============================================================================
// Hook (overloaded)
// ============================================================================

/**
 * Hook to access the clipping workspace store.
 *
 * @param selector - Optional selector function to pick specific state
 * @returns Selected state when selector provided, store API when no selector
 *
 * @example
 * // With selector - returns selected state, triggers re-render on change
 * const isPlaying = useClippingWorkspaceStore((s) => s.isPlaying);
 *
 * @example
 * // Without selector - returns store API for direct access/subscribe
 * const store = useClippingWorkspaceStore();
 * store.subscribe((state) => state.currentTime, (time) => { ... });
 */
export function useClippingWorkspaceStore<T>(
  selector: (store: ClippingWorkspaceStore) => T,
): T;
export function useClippingWorkspaceStore(): {
  store: ClippingWorkspaceStoreApi;
  actions: ClippingWorkspaceActions;
};
export function useClippingWorkspaceStore<T>(
  selector?: (store: ClippingWorkspaceStore) => T,
) {
  const context = useContext(ClippingWorkspaceStoreContext);

  if (!context) {
    throw new Error(
      "useClippingWorkspaceStore must be used within ClippingWorkspaceStoreProvider",
    );
  }

  // biome-ignore lint/correctness/useHookAtTopLevel: Overloaded hook pattern - selector is always defined in typed overload
  // biome-ignore lint/style/noNonNullAssertion: Selector is always defined in typed overload
  return selector ? useStore(context.store, selector!) : context;
}

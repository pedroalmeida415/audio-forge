import type { Observable } from "@legendapp/state";
import { batch, observable } from "@legendapp/state";
import { createSpeakerColorMap } from "~/lib/speaker-colors";
import type { Diarization, DiarizationSegment } from "~/server/db/schema";
import type { api } from "~/trpc/react";

// ============================================================================
// Types
// ============================================================================

export type ViewMode = "table" | "focus";

type SpeakerCollections = NonNullable<Diarization["speakerCollections"]>;

export interface ClippingStoreInitialData {
  diarization: Pick<
    Diarization,
    "id" | "projectId" | "output" | "speakerCollections"
  > & {
    file: { storageKey: string | null } | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

export const TIMELINE_CONSTANTS = {
  BASE_TIMESPAN: 60,
  MIN_ZOOM: 25,
  MAX_ZOOM: 400,
  DEFAULT_ZOOM: 100,
} as const;

// ============================================================================
// Store State Shape
// ============================================================================

export interface ClippingStoreState {
  // Core data
  diarizationId: string;
  projectId: string;
  segments: DiarizationSegment[];
  speakerCollections: SpeakerCollections;

  // Computed values
  speakerColors: () => Record<string, string>;

  // Playback state (actions handled by playback context)
  playback: {
    isPlaying: boolean;
    duration: number;
    currentTime: number;
    playbackRate: number;
    isLoading: boolean;
    error: string | null;
  };

  // Timeline state + actions
  timeline: {
    zoomLevel: number;
    containerWidth: number;
    setZoomLevel: (level: number) => void;
    setContainerWidth: (width: number) => void;
  };

  // UI state
  ui: {
    viewMode: ViewMode;
  };

  // Selection state + actions
  selection: {
    selectedSpeaker: string | null;
    selectedSegmentId: string | null;
    selectedSegmentIds: Set<string>;
    activeSegmentId: string | null;
    selectSpeaker: (speaker: string | null) => void;
    selectSegment: (segmentId: string | null) => void;
    toggleSegmentSelection: (segmentId: string) => void;
    selectAllSegments: () => void;
    clearSelection: () => void;
    setSelectedSegmentIds: (ids: Set<string>) => void;
    setActiveSegment: (segmentId: string | null) => void;
  };

  // Segment actions (separate since segments is an array)
  segmentActions: {
    updateTimes: (segmentId: string, start: number, end: number) => void;
    archive: (segmentId: string) => void;
    archiveSelected: () => void;
    restore: (segmentId: string) => void;
    markAsReviewed: (segmentIds: string[]) => void;
    markAsUnreviewed: (segmentIds: string[]) => void;
    changeSpeaker: (segmentIds: string[], newSpeaker: string) => void;
    split: (
      segmentId: string,
      splitTime: number,
    ) => { firstId: string; secondId: string };
    setSpeakerCollection: (
      speaker: string,
      collection: { collectionId: string; collectionName: string },
    ) => void;
    // Rollback helpers
    restoreData: (segmentId: string, data: DiarizationSegment) => void;
    undoSplit: (
      firstId: string,
      secondId: string,
      original: DiarizationSegment,
    ) => void;
    bulkRestore: (
      data: Array<{ id: string; data: DiarizationSegment }>,
    ) => void;
  };
}

export type $ClippingStore = Observable<ClippingStoreState>;

// ============================================================================
// Store Hook
// ============================================================================

/**
 * Hook to create the clipping store observable.
 * Must be called from a React component (the provider).
 * Uses useObservable which returns a stable observable across renders.
 */
export function createClippingStore(
  initialData: ClippingStoreInitialData,
  trpcUtils: ReturnType<typeof api.useUtils>,
): $ClippingStore {
  const segments = initialData.diarization.output?.segments ?? [];
  const speakerCollections =
    initialData.diarization.speakerCollections ?? ({} as SpeakerCollections);

  // Create the observable - closures capture $store by reference
  // This works because closures capture variables by reference, not value.
  // When the functions are later called, $store will be assigned.
  const $store = observable<ClippingStoreState>({
    diarizationId: initialData.diarization.id,
    projectId: initialData.diarization.projectId,
    segments,
    speakerCollections,

    // ========================================================================
    // Computed Values
    // ========================================================================

    speakerColors: () => {
      const segments = $store.segments.get();
      const speakers = [...new Set(segments.map((s) => s.speaker))];
      return createSpeakerColorMap(speakers);
    },

    // ========================================================================
    // Playback State
    // ========================================================================

    playback: {
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playbackRate: 1,
      isLoading: true,
      error: null as string | null,
    },

    // ========================================================================
    // Timeline State + Actions
    // ========================================================================

    timeline: {
      zoomLevel: TIMELINE_CONSTANTS.DEFAULT_ZOOM,
      containerWidth: 800,

      setZoomLevel: (level: number) => {
        const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;
        $store.timeline.zoomLevel.set(
          Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)),
        );
      },

      setContainerWidth: (width: number) => {
        $store.timeline.containerWidth.set(width);
      },
    },

    // ========================================================================
    // UI State
    // ========================================================================

    ui: {
      viewMode: "table" as ViewMode,
    },

    // ========================================================================
    // Selection State + Actions
    // ========================================================================

    selection: {
      selectedSpeaker: null as string | null,
      selectedSegmentId: null as string | null,
      selectedSegmentIds: new Set<string>(),
      activeSegmentId: null as string | null,

      selectSpeaker: (speaker: string | null) => {
        batch(() => {
          $store.selection.selectedSpeaker.set(speaker);
          $store.selection.selectedSegmentId.set(null);
          $store.selection.selectedSegmentIds.set(new Set<string>());
        });
      },

      selectSegment: (segmentId: string | null) => {
        if (!segmentId) {
          $store.selection.selectedSegmentId.set(null);
          return;
        }

        const segment = $store.segments.peek().find((s) => s.id === segmentId);
        const currentSpeaker = $store.selection.selectedSpeaker.peek();

        batch(() => {
          $store.selection.selectedSegmentId.set(segmentId);
          if (segment && segment.speaker !== currentSpeaker) {
            $store.selection.selectedSpeaker.set(segment.speaker);
          }
        });
      },

      toggleSegmentSelection: (segmentId: string) => {
        batch(() => {
          const selectedIds = $store.selection.selectedSegmentIds.peek();
          const newSet = new Set(selectedIds);

          if (newSet.has(segmentId)) {
            newSet.delete(segmentId);
          } else {
            newSet.add(segmentId);
          }

          $store.selection.selectedSegmentIds.set(newSet);
          $store.selection.activeSegmentId.set(null);
        });
      },

      selectAllSegments: () => {
        const selectedSpeaker = $store.selection.selectedSpeaker.peek();
        if (!selectedSpeaker) return;

        const segments = $store.segments.peek();
        const visibleSegmentIds = segments
          .filter((s) => !s.isDeleted && s.speaker === selectedSpeaker)
          .map((s) => s.id);

        batch(() => {
          $store.selection.selectedSegmentIds.set(new Set(visibleSegmentIds));
          $store.selection.activeSegmentId.set(null);
        });
      },

      clearSelection: () => {
        $store.selection.selectedSegmentIds.set(new Set<string>());
      },

      setSelectedSegmentIds: (ids: Set<string>) => {
        $store.selection.selectedSegmentIds.set(ids);
      },

      setActiveSegment: (segmentId: string | null) => {
        if (!segmentId) {
          $store.selection.activeSegmentId.set(null);
          return;
        }

        const segment = $store.segments.peek().find((s) => s.id === segmentId);
        const currentSpeaker = $store.selection.selectedSpeaker.peek();

        batch(() => {
          $store.selection.activeSegmentId.set(segmentId);
          if (segment && segment.speaker !== currentSpeaker) {
            $store.selection.selectedSpeaker.set(segment.speaker);
          }
        });
      },
    },

    // ========================================================================
    // Segment Actions
    // ========================================================================

    segmentActions: {
      updateTimes: (segmentId: string, start: number, end: number) => {
        const idx = $store.segments.peek().findIndex((s) => s.id === segmentId);
        const $segment = $store.segments[idx];
        if (!$segment) return;
        batch(() => {
          $segment.start.set(Math.max(0, start));
          $segment.end.set(Math.max(start + 0.1, end));
        });
      },

      archive: (segmentId: string) => {
        batch(() => {
          const idx = $store.segments
            .peek()
            .findIndex((s) => s.id === segmentId);
          const $segment = $store.segments[idx];
          if ($segment) {
            $segment.isDeleted.set(true);
          }

          const selectedIds = $store.selection.selectedSegmentIds.peek();
          if (selectedIds.has(segmentId)) {
            const newSet = new Set(selectedIds);
            newSet.delete(segmentId);
            $store.selection.selectedSegmentIds.set(newSet);
          }
        });
      },

      archiveSelected: () => {
        const selectedIds = $store.selection.selectedSegmentIds.peek();
        if (selectedIds.size === 0) return;

        batch(() => {
          const segments = $store.segments.peek();
          for (const id of selectedIds) {
            const idx = segments.findIndex((s) => s.id === id);
            const $segment = $store.segments[idx];
            if ($segment) {
              $segment.isDeleted.set(true);
            }
          }
          $store.selection.selectedSegmentIds.set(new Set<string>());
        });
      },

      restore: (segmentId: string) => {
        const idx = $store.segments.peek().findIndex((s) => s.id === segmentId);
        const $segment = $store.segments[idx];
        if ($segment) {
          $segment.isDeleted.set(false);
        }
      },

      markAsReviewed: (segmentIds: string[]) => {
        batch(() => {
          const segments = $store.segments.peek();
          for (const id of segmentIds) {
            const idx = segments.findIndex((s) => s.id === id);
            const $segment = $store.segments[idx];
            if ($segment) {
              $segment.isReviewed.set(true);
            }
          }
        });
      },

      markAsUnreviewed: (segmentIds: string[]) => {
        batch(() => {
          const segments = $store.segments.peek();
          for (const id of segmentIds) {
            const idx = segments.findIndex((s) => s.id === id);
            const $segment = $store.segments[idx];
            if ($segment) {
              $segment.isReviewed.set(false);
            }
          }
        });
      },

      changeSpeaker: (segmentIds: string[], newSpeaker: string) => {
        batch(() => {
          const segments = $store.segments.peek();
          for (const id of segmentIds) {
            const idx = segments.findIndex((s) => s.id === id);
            const $segment = $store.segments[idx];
            if ($segment) {
              $segment.speaker.set(newSpeaker);
            }
          }
        });
      },

      split: (
        segmentId: string,
        splitTime: number,
      ): { firstId: string; secondId: string } => {
        const segments = $store.segments.peek();
        const idx = segments.findIndex((s) => s.id === segmentId);
        const $segment = $store.segments[idx];
        const segment = segments[idx];

        if (
          !$segment ||
          !segment ||
          splitTime <= segment.start ||
          splitTime >= segment.end
        ) {
          return { firstId: "", secondId: "" };
        }

        const secondId = crypto.randomUUID();
        const firstId = segment.id;

        batch(() => {
          // Update original segment's end time
          $segment.end.set(splitTime);

          // Create new second segment
          const newSegment: DiarizationSegment = {
            ...segment,
            id: secondId,
            start: splitTime,
            end: segment.end,
            isReviewed: false,
          };

          // Insert new segment after original using push
          $store.segments.push(newSegment);

          $store.selection.activeSegmentId.set(secondId);
        });

        return { firstId, secondId };
      },

      setSpeakerCollection: (
        speaker: string,
        collection: { collectionId: string; collectionName: string },
      ) => {
        const $speakerCollection = $store.speakerCollections[speaker];
        if ($speakerCollection) {
          $speakerCollection.set(collection);
        } else {
          $store.speakerCollections.set({
            ...$store.speakerCollections.peek(),
            [speaker]: collection,
          });
        }
      },

      // Rollback helpers
      restoreData: (segmentId: string, data: DiarizationSegment) => {
        const idx = $store.segments.peek().findIndex((s) => s.id === segmentId);
        const $segment = $store.segments[idx];
        if ($segment) {
          $segment.set(data);
        }
      },

      undoSplit: (
        firstId: string,
        secondId: string,
        original: DiarizationSegment,
      ) => {
        batch(() => {
          // Remove the second segment and restore original
          const segments = $store.segments
            .peek()
            .filter((s) => s.id !== secondId);
          const idx = segments.findIndex((s) => s.id === firstId);
          if (idx >= 0) {
            segments[idx] = original;
          }
          $store.segments.set(segments);

          if ($store.selection.activeSegmentId.peek() === secondId) {
            $store.selection.activeSegmentId.set(firstId);
          }
        });
      },

      bulkRestore: (
        restoreData: Array<{ id: string; data: DiarizationSegment }>,
      ) => {
        batch(() => {
          const segments = $store.segments.peek();
          for (const { id, data } of restoreData) {
            const idx = segments.findIndex((s) => s.id === id);
            const $segment = $store.segments[idx];
            if ($segment) {
              $segment.set(data);
            }
          }
        });
      },
    },
  }) as $ClippingStore;

  // Speaker collection updates
  trpcUtils.diarization.setSpeakerCollection.setMutationDefaults({
    onMutate: async (input) => {
      const { speaker, collectionId, collectionName, diarizationId } = input;

      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      const $speakerCollection = $store.speakerCollections[speaker];
      const previousMapping = $speakerCollection?.peek() ?? null;

      $store.segmentActions.setSpeakerCollection(speaker, {
        collectionId,
        collectionName,
      });

      return { previousMapping, diarizationId };
    },
    onError: (_err, newData, context) => {
      if (context?.previousMapping) {
        $store.segmentActions.setSpeakerCollection(
          newData.speaker,
          context.previousMapping,
        );
      }
    },
  });

  // Segment updates
  trpcUtils.diarization.updateSegments.setMutationDefaults({
    onMutate: async (input) => {
      const { diarizationId, segmentIds, updates } = input;

      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      const segments = $store.segments.peek();
      const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
      const previousSegments = ids.map((id) => {
        const segment = segments.find((s) => s.id === id);
        return { id, data: segment ? { ...segment } : null };
      });

      for (const id of ids) {
        const segment = segments.find((s) => s.id === id);
        if (!segment) continue;

        if (updates.start !== undefined || updates.end !== undefined) {
          $store.segmentActions.updateTimes(
            id,
            updates.start ?? segment.start,
            updates.end ?? segment.end,
          );
        }
        if (updates.speaker !== undefined) {
          $store.segmentActions.changeSpeaker([id], updates.speaker);
        }
        if (updates.isDeleted !== undefined) {
          if (updates.isDeleted) {
            $store.segmentActions.archive(id);
          } else {
            $store.segmentActions.restore(id);
          }
        }
        if (updates.isReviewed !== undefined) {
          if (updates.isReviewed) {
            $store.segmentActions.markAsReviewed([id]);
          } else {
            $store.segmentActions.markAsUnreviewed([id]);
          }
        }
      }

      return { previousSegments, diarizationId };
    },
    onError: (_err, _input, context) => {
      if (context?.previousSegments) {
        $store.segmentActions.bulkRestore(
          context.previousSegments as Array<{
            id: string;
            data: DiarizationSegment;
          }>,
        );
      }
    },
  });

  // Segment splitting
  trpcUtils.diarization.splitSegment.setMutationDefaults({
    onMutate: async (input) => {
      const { diarizationId, segmentId, splitTime } = input;

      await trpcUtils.diarization.getById.cancel({ id: diarizationId });

      const segment = $store.segments.peek().find((s) => s.id === segmentId);
      const originalSegment = segment ? { ...segment } : null;

      const { firstId, secondId } = $store.segmentActions.split(
        segmentId,
        splitTime,
      );

      return { originalSegment, diarizationId, firstId, secondId };
    },
    onError: (_err, _input, context) => {
      if (context?.originalSegment && context.firstId && context.secondId) {
        $store.segmentActions.undoSplit(
          context.firstId,
          context.secondId,
          context.originalSegment as DiarizationSegment,
        );
      }
    },
  });

  return $store;
}

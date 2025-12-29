import type { DiarizationSegment } from "~/server/db/schema";
import type { api } from "~/trpc/react";
import type { $ClippingStore } from "./clipping-store";

type TrpcUtils = ReturnType<typeof api.useUtils>;

/**
 * Sets up mutation defaults with optimistic updates using Legend-State's
 * fine-grained reactivity. Components can simply call mutation.mutate()
 * without managing state - all updates and rollbacks are handled here.
 */
export function setupMutationDefaults(
  getStore: () => $ClippingStore,
  trpcUtils: TrpcUtils,
) {
  // Lazy store access via proxy - defers initialization until first property access
  let _store: $ClippingStore | undefined;
  const $store = new Proxy({} as $ClippingStore, {
    get(_, prop) {
      _store ??= getStore();
      return _store[prop as keyof typeof _store];
    },
  });

  // updateSegments: handles speaker changes, delete, mark as reviewed, time edits
  trpcUtils.diarization.updateSegments.setMutationDefaults({
    onMutate: async (variables) => {
      const segmentIds = Array.isArray(variables.segmentIds)
        ? variables.segmentIds
        : [variables.segmentIds];
      const segmentIdSet = new Set(segmentIds);

      // Store previous values for rollback (only affected segments)
      const previousValues: Record<string, Partial<DiarizationSegment>> = {};

      // Apply optimistic updates using fine-grained mutations
      for (let i = 0; i < $store.segments.length; i++) {
        const $segment = $store.segments[i];
        if (!$segment) continue;

        const segmentId = $segment.id.peek();

        if (segmentIdSet.has(segmentId)) {
          // Capture previous values for the fields being updated
          const prev: Partial<DiarizationSegment> = {};
          for (const key of Object.keys(variables.updates) as Array<
            keyof typeof variables.updates
          >) {
            prev[key] = $segment[key].peek() as never;
          }
          previousValues[segmentId] = prev;

          // Apply the update
          $segment.assign(variables.updates);
        }
      }

      // If changing speaker, ensure speaker exists in the set
      if (variables.updates.speaker) {
        $store.speakers.add(variables.updates.speaker);
      }

      // Clear selection after mutation
      $store.clearAllSelected();

      return { previousValues };
    },
    onError: (_err, _variables, context) => {
      if (!context?.previousValues) return;

      // Rollback: restore previous values
      for (let i = 0; i < $store.segments.length; i++) {
        const $segment = $store.segments[i];
        if (!$segment) continue;

        const segmentId = $segment.id.peek();
        const prev = context.previousValues[segmentId];

        if (prev) {
          $segment.assign(prev);
        }
      }
    },
  });

  // splitSegment: handles splitting a segment at a specific time
  trpcUtils.diarization.splitSegment.setMutationDefaults({
    onMutate: async (variables) => {
      const segments = $store.segments.peek();
      const segmentIndex = segments.findIndex(
        (s) => s.id === variables.segmentId,
      );
      const originalSegment = segments[segmentIndex];
      if (segmentIndex === -1 || !originalSegment) {
        return { segmentIndex: -1, originalEnd: 0, newSegmentId: "" };
      }

      // Store original for rollback
      const originalEnd = originalSegment.end;

      // Update existing segment's end time
      $store.segments[segmentIndex]?.end.set(variables.splitTime);

      // Create and insert new segment after the split
      const newSegment: DiarizationSegment = {
        id: crypto.randomUUID(),
        speaker: originalSegment.speaker,
        start: variables.splitTime,
        end: originalEnd,
        confidence: originalSegment.confidence,
        isDeleted: originalSegment.isDeleted,
        isReviewed: false,
      };

      // Insert after the current segment
      $store.segments.splice(segmentIndex + 1, 0, newSegment);

      return {
        segmentIndex,
        originalEnd,
        newSegmentId: newSegment.id,
      };
    },
    onError: (_err, _variables, context) => {
      if (!context || context.segmentIndex === -1) return;

      // Restore original end time
      $store.segments[context.segmentIndex]?.end.set(context.originalEnd);

      // Remove the inserted segment
      const segments = $store.segments.peek();
      const newSegmentIndex = segments.findIndex(
        (s) => s.id === context.newSegmentId,
      );
      if (newSegmentIndex !== -1) {
        $store.segments.splice(newSegmentIndex, 1);
      }
    },
  });

  // setSpeakerCollection: handles mapping speakers to collections
  trpcUtils.diarization.setSpeakerCollection.setMutationDefaults({
    onMutate: async (variables) => {
      const $speakerCollection = $store.speakerCollections[variables.speaker];
      const previousValue = $speakerCollection?.peek();

      // Optimistically update speaker collection mapping
      $store.speakerCollections.assign({
        [variables.speaker]: {
          collectionId: variables.collectionId,
          collectionName: variables.collectionName,
        },
      });

      return { speaker: variables.speaker, previousValue };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;

      const $speakerCollection = $store.speakerCollections[context.speaker];
      if (context.previousValue && $speakerCollection) {
        $speakerCollection.set(context.previousValue);
      } else if ($speakerCollection) {
        $speakerCollection.delete();
      }
    },
  });

  // createSegment: handles creating new segments from click-and-drag
  trpcUtils.diarization.createSegment.setMutationDefaults({
    onMutate: async (variables) => {
      // Create optimistic segment with temporary ID
      const tempId = crypto.randomUUID();
      const newSegment: DiarizationSegment = {
        id: tempId,
        speaker: variables.segment.speaker,
        start: variables.segment.start,
        end: variables.segment.end,
        isDeleted: false,
        isReviewed: true,
      };

      // Find insertion index to maintain sort order by start time
      const segments = $store.segments.peek();
      let insertIndex = segments.findIndex((s) => s.start > newSegment.start);
      if (insertIndex === -1) {
        insertIndex = segments.length;
      }

      // Insert segment at correct position
      $store.segments.splice(insertIndex, 0, newSegment);

      // Ensure speaker exists in the set
      $store.speakers.add(newSegment.speaker);

      // Clear selection state
      $store.selection.cancelSelection();

      // Select the new segment
      $store.setActiveSegment(tempId);

      return { tempId, insertIndex };
    },
    onSuccess: (result, _variables, context) => {
      if (!context?.tempId) return;

      // Replace temp ID with real ID from server
      const segments = $store.segments.peek();
      const index = segments.findIndex((s) => s.id === context.tempId);
      if (index !== -1) {
        $store.segments[index]?.id.set(result.segmentId);

        // Update active segment to real ID
        if ($store.activeSegmentId.peek() === context.tempId) {
          $store.activeSegmentId.set(result.segmentId);
        }
      }
    },
    onError: (_err, _variables, context) => {
      if (!context?.tempId) return;

      // Remove the optimistically added segment
      const segments = $store.segments.peek();
      const index = segments.findIndex((s) => s.id === context.tempId);
      if (index !== -1) {
        $store.segments.splice(index, 1);
      }

      // Clear active segment if it was the removed one
      if ($store.activeSegmentId.peek() === context.tempId) {
        $store.activeSegmentId.set(null);
      }
    },
  });
}

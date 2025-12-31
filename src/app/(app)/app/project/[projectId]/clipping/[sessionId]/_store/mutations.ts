import type { FileSegment, WorkspaceSpeaker } from "~/server/db/schema";
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

  // ============================================================================
  // Segment Mutations
  // ============================================================================

  // updateSegments: handles speaker changes, delete, mark as reviewed, time edits
  trpcUtils.file.updateSegments.setMutationDefaults({
    onMutate: async (variables) => {
      const segmentIds = Array.isArray(variables.segmentIds)
        ? variables.segmentIds
        : [variables.segmentIds];
      const segmentIdSet = new Set(segmentIds);

      // Store previous values for rollback (only affected segments)
      const previousValues: Record<string, Partial<FileSegment>> = {};

      // Apply optimistic updates using fine-grained mutations
      for (let i = 0; i < $store.segments.length; i++) {
        const $segment = $store.segments[i];
        if (!$segment) continue;

        const segmentId = $segment.id.peek();

        if (segmentIdSet.has(segmentId)) {
          // Capture previous values for the fields being updated
          const prev: Partial<FileSegment> = {};
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
  trpcUtils.file.splitSegment.setMutationDefaults({
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
      const now = new Date().toISOString();
      const newSegment: FileSegment = {
        id: crypto.randomUUID(),
        speakerId: originalSegment.speakerId,
        start: variables.splitTime,
        end: originalEnd,
        confidence: originalSegment.confidence,
        source: originalSegment.source,
        isDeleted: originalSegment.isDeleted,
        isReviewed: false,
        createdAt: now,
        updatedAt: now,
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

  // createSegment: handles creating new segments from click-and-drag
  trpcUtils.file.createSegment.setMutationDefaults({
    onMutate: async (variables) => {
      // Create optimistic segment with temporary ID
      const tempId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newSegment: FileSegment = {
        id: tempId,
        speakerId: variables.segment.speakerId,
        start: variables.segment.start,
        end: variables.segment.end,
        source: "manual",
        isDeleted: false,
        isReviewed: true,
        createdAt: now,
        updatedAt: now,
      };

      // Find insertion index to maintain sort order by start time
      const segments = $store.segments.peek();
      let insertIndex = segments.findIndex((s) => s.start > newSegment.start);
      if (insertIndex === -1) {
        insertIndex = segments.length;
      }

      // Insert segment at correct position
      $store.segments.splice(insertIndex, 0, newSegment);

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

  // ============================================================================
  // Speaker Mutations
  // ============================================================================

  // createSpeaker: handles adding a new speaker to the workspace
  trpcUtils.file.createSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const tempId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newSpeaker: WorkspaceSpeaker = {
        id: tempId,
        label: variables.label,
        color: variables.color,
        createdAt: now,
      };

      $store.addSpeaker(newSpeaker);

      return { tempId };
    },
    onSuccess: (result, _variables, context) => {
      if (!context?.tempId || !result.speaker) return;

      // Replace temp ID with real ID from server
      const speakers = $store.speakers.peek();
      const index = speakers.findIndex((s) => s.id === context.tempId);
      if (index !== -1) {
        $store.speakers[index]?.id.set(result.speaker.id);
      }
    },
    onError: (_err, _variables, context) => {
      if (!context?.tempId) return;
      $store.removeSpeaker(context.tempId);
    },
  });

  // updateSpeaker: handles renaming a speaker or changing color
  // API expects flat params: { fileId, speakerId, label?, color? }
  trpcUtils.file.updateSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const speakers = $store.speakers.peek();
      const speaker = speakers.find((s) => s.id === variables.speakerId);
      const previousValue = speaker ? { ...speaker } : undefined;

      if (speaker) {
        // Build updates object from flat variables
        const updates: Partial<{ label: string; color: string }> = {};
        if (variables.label !== undefined) updates.label = variables.label;
        if (variables.color !== undefined) updates.color = variables.color;
        $store.updateSpeaker(variables.speakerId, updates);
      }

      return { previousValue };
    },
    onError: (_err, variables, context) => {
      if (!context?.previousValue) return;
      $store.updateSpeaker(variables.speakerId, context.previousValue);
    },
  });

  // deleteSpeaker: handles removing a speaker and optionally reassigning segments
  trpcUtils.file.deleteSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const speakers = $store.speakers.peek();
      const speakerIndex = speakers.findIndex(
        (s) => s.id === variables.speakerId,
      );
      const previousSpeaker =
        speakerIndex !== -1 ? { ...speakers[speakerIndex]! } : undefined;

      // Store affected segments for rollback
      const affectedSegments: Array<{ index: number; speakerId: string }> = [];

      // If reassigning segments to another speaker
      if (variables.reassignToSpeakerId) {
        for (let i = 0; i < $store.segments.length; i++) {
          const $segment = $store.segments[i];
          if (!$segment) continue;

          if ($segment.speakerId.peek() === variables.speakerId) {
            affectedSegments.push({
              index: i,
              speakerId: variables.speakerId,
            });
            $segment.speakerId.set(variables.reassignToSpeakerId);
          }
        }
      }

      // Remove the speaker
      $store.removeSpeaker(variables.speakerId);

      // Clear selection if the deleted speaker was selected
      if ($store.selectedSpeakerId.peek() === variables.speakerId) {
        $store.selectedSpeakerId.set(null);
      }

      return { previousSpeaker, speakerIndex, affectedSegments };
    },
    onError: (_err, _variables, context) => {
      if (!context?.previousSpeaker) return;

      // Restore the speaker at its original position
      $store.speakers.splice(context.speakerIndex, 0, context.previousSpeaker);

      // Restore segment speaker assignments
      for (const { index, speakerId } of context.affectedSegments) {
        $store.segments[index]?.speakerId.set(speakerId);
      }
    },
  });
}

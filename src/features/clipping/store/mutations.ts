import { generateSpeakerColor } from "~/lib/speaker-colors";
import type { SegmentWithSource, SpeakerWithSource } from "~/server/db/schema";
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

  // updateSegments: handles speaker changes, time edits
  trpcUtils.clippingSession.updateSegments.setMutationDefaults({
    onMutate: async (variables) => {
      const segmentIds = Array.isArray(variables.segmentIds)
        ? variables.segmentIds
        : [variables.segmentIds];
      const segmentIdSet = new Set(segmentIds);

      // Store previous values for rollback (only affected segments)
      const previousValues: Record<string, Partial<SegmentWithSource>> = {};

      // Apply optimistic updates using fine-grained mutations
      for (let i = 0; i < $store.segments.length; i++) {
        const $segment = $store.segments[i];
        if (!$segment) continue;

        const segmentId = $segment.id.peek();

        if (segmentIdSet.has(segmentId)) {
          // Capture previous values for the fields being updated
          const prev: Partial<SegmentWithSource> = {};
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
  trpcUtils.clippingSession.splitSegment.setMutationDefaults({
    onMutate: async (variables) => {
      const segments = $store.segments.peek();
      const segmentIndex = segments.findIndex(
        (s) => s.id === variables.segmentId,
      );
      const originalSegment = segments[segmentIndex];
      if (segmentIndex === -1 || !originalSegment) {
        return { segmentIndex: -1, originalEndTime: 0, newSegmentId: "" };
      }

      // Store original for rollback
      const originalEndTime = originalSegment.endTime;

      // Update existing segment's end time
      $store.segments[segmentIndex]?.endTime.set(variables.splitTime);

      // Create and insert new segment after the split (inherits source from original)
      const now = new Date();
      const newSegment: SegmentWithSource = {
        id: crypto.randomUUID(),
        sessionId: originalSegment.sessionId,
        speakerId: originalSegment.speakerId,
        startTime: variables.splitTime,
        endTime: originalEndTime,
        createdAt: now,
        updatedAt: now,
        source: originalSegment.source,
      };

      // Insert after the current segment
      $store.segments.splice(segmentIndex + 1, 0, newSegment);

      return {
        segmentIndex,
        originalEndTime,
        newSegmentId: newSegment.id,
      };
    },
    onError: (_err, _variables, context) => {
      if (!context || context.segmentIndex === -1) return;

      // Restore original end time
      $store.segments[context.segmentIndex]?.endTime.set(
        context.originalEndTime,
      );

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
  trpcUtils.clippingSession.createSegment.setMutationDefaults({
    onMutate: async (variables) => {
      // Get speaker info for the optimistic segment
      const speaker = $store.speakers
        .peek()
        .find((s) => s.id === variables.segment.speakerId);
      if (!speaker) {
        return { tempId: "", insertIndex: -1 };
      }

      // Create optimistic segment with temporary ID (always project source)
      const tempId = crypto.randomUUID();
      const now = new Date();
      const newSegment: SegmentWithSource = {
        id: tempId,
        sessionId: $store.sessionId.peek(),
        speakerId: variables.segment.speakerId,
        startTime: variables.segment.startTime,
        endTime: variables.segment.endTime,
        createdAt: now,
        updatedAt: now,
        source: "project",
      };

      // Find insertion index to maintain sort order by start time
      const segments = $store.segments.peek();
      let insertIndex = segments.findIndex(
        (s) => s.startTime > newSegment.startTime,
      );
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

  // deleteSegments: handles deleting one or more segments
  trpcUtils.clippingSession.deleteSegments.setMutationDefaults({
    onMutate: async (variables) => {
      const segmentIds = new Set(variables.segmentIds);

      // Store removed segments for rollback (with their indices for correct restoration)
      const removedSegments: Array<{
        index: number;
        segment: SegmentWithSource;
      }> = [];

      // Find and store segments to remove (iterate backwards for stable indices)
      const segments = $store.segments.peek();
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && segmentIds.has(segment.id)) {
          removedSegments.push({ index: i, segment: { ...segment } });
          $store.segments.splice(i, 1);
        }
      }

      // Clear active segment if it was deleted
      const activeId = $store.activeSegmentId.peek();
      if (activeId && segmentIds.has(activeId)) {
        $store.activeSegmentId.set(null);
      }

      // Clear any selected segments that were deleted
      const selectedIds = $store.selectedSegmentIds.peek();
      const remainingSelected = new Set(
        [...selectedIds].filter((id) => !segmentIds.has(id)),
      );
      if (remainingSelected.size !== selectedIds.size) {
        $store.selectedSegmentIds.set(remainingSelected);
      }

      return { removedSegments };
    },
    onError: (_err, _variables, context) => {
      if (!context?.removedSegments) return;

      // Restore segments in reverse order to maintain correct indices
      for (const { index, segment } of context.removedSegments.reverse()) {
        $store.segments.splice(index, 0, segment);
      }
    },
  });

  // ============================================================================
  // Speaker Mutations
  // ============================================================================

  // createSpeaker: handles adding a new speaker to the project (always project source)
  trpcUtils.clippingSession.createSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const tempId = crypto.randomUUID();
      const now = new Date();
      const newSpeaker: SpeakerWithSource = {
        id: tempId,
        projectId: $store.projectId.peek(),
        userId: "", // Will be set by server
        name: variables.name,
        color: variables.color ?? generateSpeakerColor(),
        createdAt: now,
        updatedAt: now,
        source: "project",
      };

      $store.addSpeaker(newSpeaker);

      return { tempId };
    },
    onSuccess: (result, _variables, context) => {
      if (!context?.tempId || !result.speaker) return;

      // Replace temp speaker with real speaker from server (preserving source)
      const speakers = $store.speakers.peek();
      const index = speakers.findIndex((s) => s.id === context.tempId);
      if (index !== -1) {
        $store.speakers[index]?.set({ ...result.speaker, source: "project" });
      }
    },
    onError: (_err, _variables, context) => {
      if (!context?.tempId) return;
      $store.removeSpeaker(context.tempId);
    },
  });

  // updateSpeaker: handles renaming a speaker or changing color
  // API expects flat params: { speakerId, name?, color? }
  trpcUtils.clippingSession.updateSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const speakers = $store.speakers.peek();
      const speaker = speakers.find((s) => s.id === variables.speakerId);
      const previousValue = speaker ? { ...speaker } : undefined;

      if (speaker) {
        // Build updates object from flat variables
        const updates: Partial<{ name: string; color: string }> = {};
        if (variables.name !== undefined) updates.name = variables.name;
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

  // updateLocalSpeaker: handles renaming a local speaker
  trpcUtils.clippingSession.updateLocalSpeaker.setMutationDefaults({
    onMutate: async (variables) => {
      const speakers = $store.speakers.peek();
      const speaker = speakers.find((s) => s.id === variables.speakerId);
      const previousValue = speaker ? { ...speaker } : undefined;

      if (speaker) {
        $store.updateSpeaker(variables.speakerId, { name: variables.name });
      }

      return { previousValue };
    },
    onError: (_err, variables, context) => {
      if (!context?.previousValue) return;
      $store.updateSpeaker(variables.speakerId, context.previousValue);
    },
  });

  // deleteSpeakerFromSession: removes a local speaker and their segments
  // Only works for local speakers (backend will reject project speakers)
  trpcUtils.clippingSession.deleteSpeakerFromSession.setMutationDefaults({
    onMutate: async (variables) => {
      // Store affected segments for rollback
      const removedSegments: Array<{
        index: number;
        segment: SegmentWithSource;
      }> = [];

      // Store removed speaker for rollback
      const speakers = $store.speakers.peek();
      const speakerIndex = speakers.findIndex(
        (s) => s.id === variables.speakerId,
      );
      const removedSpeaker =
        speakerIndex !== -1 ? { ...speakers[speakerIndex]! } : undefined;

      // Remove segments for this speaker from the store
      const segments = $store.segments.peek();
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && segment.speakerId === variables.speakerId) {
          removedSegments.push({ index: i, segment: { ...segment } });
          $store.segments.splice(i, 1);
        }
      }

      // Remove the local speaker from the store
      if (speakerIndex !== -1) {
        $store.speakers.splice(speakerIndex, 1);
      }

      // Clear selection if the deleted speaker was selected
      if ($store.selectedSpeakerId.peek() === variables.speakerId) {
        $store.selectedSpeakerId.set(null);
      }

      return { removedSegments, removedSpeaker, speakerIndex };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;

      // Restore segments in reverse order to maintain indices
      if (context.removedSegments) {
        for (const { index, segment } of context.removedSegments.reverse()) {
          $store.segments.splice(index, 0, segment);
        }
      }

      // Restore speaker
      if (context.removedSpeaker && context.speakerIndex !== -1) {
        $store.speakers.splice(context.speakerIndex, 0, context.removedSpeaker);
      }
    },
  });

  // promoteLocalSegments: promotes local segments to project level with a new speaker
  trpcUtils.clippingSession.promoteLocalSegments.setMutationDefaults({
    onMutate: async (variables) => {
      const localSegmentIds = new Set(variables.localSegmentIds);

      // Store removed segments for rollback (with their indices)
      const removedSegments: Array<{
        index: number;
        segment: SegmentWithSource;
      }> = [];

      // Find and store local segments to promote
      const segments = $store.segments.peek();
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && localSegmentIds.has(segment.id)) {
          removedSegments.push({ index: i, segment: { ...segment } });
          $store.segments.splice(i, 1);
        }
      }

      // Create new project segments at the same positions (will be replaced on success)
      const now = new Date();
      const tempSegments: Array<{
        tempId: string;
        segment: SegmentWithSource;
        insertIndex: number;
      }> = [];

      for (const { segment } of removedSegments) {
        const tempId = crypto.randomUUID();
        const newSegment: SegmentWithSource = {
          id: tempId,
          sessionId: segment.sessionId,
          speakerId: variables.targetSpeakerId,
          startTime: segment.startTime,
          endTime: segment.endTime,
          createdAt: now,
          updatedAt: now,
          source: "project",
        };

        // Find insertion index to maintain sort order
        const currentSegments = $store.segments.peek();
        let insertIndex = currentSegments.findIndex(
          (s) => s.startTime > newSegment.startTime,
        );
        if (insertIndex === -1) insertIndex = currentSegments.length;

        $store.segments.splice(insertIndex, 0, newSegment);
        tempSegments.push({ tempId, segment: newSegment, insertIndex });
      }

      return { removedSegments, tempSegments };
    },
    onSuccess: (result, _variables, context) => {
      if (!context?.tempSegments || !result.newSegments) return;

      // Replace temp IDs with real IDs from server
      for (let i = 0; i < context.tempSegments.length; i++) {
        const { tempId } = context.tempSegments[i]!;
        const realSegment = result.newSegments[i];
        if (!realSegment) continue;

        const segments = $store.segments.peek();
        const index = segments.findIndex((s) => s.id === tempId);
        if (index !== -1) {
          $store.segments[index]?.assign({
            id: realSegment.id,
            createdAt: realSegment.createdAt,
            updatedAt: realSegment.updatedAt,
          });
        }
      }
    },
    onError: (_err, _variables, context) => {
      if (!context) return;

      // Remove optimistically added project segments
      if (context.tempSegments) {
        for (const { tempId } of context.tempSegments) {
          const segments = $store.segments.peek();
          const index = segments.findIndex((s) => s.id === tempId);
          if (index !== -1) {
            $store.segments.splice(index, 1);
          }
        }
      }

      // Restore local segments
      if (context.removedSegments) {
        for (const { index, segment } of context.removedSegments.reverse()) {
          $store.segments.splice(index, 0, segment);
        }
      }
    },
  });
}

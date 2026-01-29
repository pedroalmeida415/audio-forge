"use client";

import { useValue } from "@legendapp/state/react";
import { useCallback, useRef } from "react";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";

const BATCH_SIZE = 25;

export function useWindowedSegments() {
  const $store = useSpeakerPageStore();
  const utils = api.useUtils();

  // Reactive state - segment IDs from Map keys
  const segmentIds = useValue(() => Array.from($store.segments.keys()));

  // Track in-flight fetches to prevent concurrent requests
  const isFetchingRef = useRef(false);

  // Fetch segments when pending items appear in rendered range
  const onRangeChange = useCallback(
    async (startIdx: number, endIdx: number) => {
      if (isFetchingRef.current) return;

      const currentSegments = $store.segments.peek();

      // Find first pending in rendered range
      let firstPendingIdx = -1;
      for (let i = startIdx; i <= endIdx; i++) {
        const id = segmentIds[i];
        if (id && currentSegments.get(id)?.status === "pending") {
          firstPendingIdx = i;
          break;
        }
      }

      if (firstPendingIdx === -1) return;

      // Collect BATCH_SIZE pending in each direction from first pending
      const idsToFetch: string[] = [];

      // Up to BATCH_SIZE going up
      const upEnd = Math.max(0, firstPendingIdx - BATCH_SIZE);
      for (let i = firstPendingIdx; i >= upEnd; i--) {
        const id = segmentIds[i];
        if (id && currentSegments.get(id)?.status === "pending") {
          idsToFetch.push(id);
        }
      }

      // Up to BATCH_SIZE going down (skip firstPendingIdx, already added)
      const downEnd = Math.min(
        segmentIds.length - 1,
        firstPendingIdx + BATCH_SIZE,
      );
      for (let i = firstPendingIdx + 1; i <= downEnd; i++) {
        const id = segmentIds[i];
        if (id && currentSegments.get(id)?.status === "pending") {
          idsToFetch.push(id);
        }
      }

      if (idsToFetch.length === 0) return;

      isFetchingRef.current = true;
      $store.markSegmentsLoading(idsToFetch);

      try {
        const result = await utils.segment.getByIds.fetch({
          segmentIds: idsToFetch,
        });
        $store.setSegmentData(result);
      } catch (error) {
        console.error("Failed to fetch segments:", error);
        $store.markSegmentsError(idsToFetch);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [$store, segmentIds, utils],
  );

  // Get segment ID at a specific index
  const getSegmentIdAt = useCallback(
    (index: number): string | undefined => {
      return segmentIds[index];
    },
    [segmentIds],
  );

  return {
    totalCount: segmentIds.length,
    getSegmentIdAt,
    onRangeChange,
  };
}

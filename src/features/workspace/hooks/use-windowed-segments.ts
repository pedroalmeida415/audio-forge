"use client";

import { useCallback, useRef } from "react";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { api } from "~/trpc/react";

const BATCH_SIZE = 25;

export function useWindowedSegments() {
  const $store = useWorkspaceStore();

  const isFetchingRef = useRef(false);

  const utils = api.useUtils();

  const onRangeChange = useCallback(
    async (startIdx: number, endIdx: number) => {
      if (isFetchingRef.current) return;

      // Always read from the proxy — never from a snapshot closure.
      // This guarantees we see the latest segments map even if the
      // callback reference is stale (captured by a setTimeout).
      const segments = $store.segments;
      const segmentIds = Array.from(segments.keys());

      let hasPending = false;
      for (let i = startIdx; i <= endIdx; i++) {
        const id = segmentIds[i];
        if (id && segments.get(id)?.status === "pending") {
          hasPending = true;
          break;
        }
      }

      if (!hasPending) return;

      const middleIdx = Math.floor((startIdx + endIdx) / 2);
      const idsToFetch: string[] = [];

      // Collect BATCH_SIZE going up from middle (inclusive)
      const upEnd = Math.max(0, middleIdx - BATCH_SIZE);
      for (let i = middleIdx; i >= upEnd; i--) {
        const id = segmentIds[i];
        if (id && segments.get(id)?.status === "pending") {
          idsToFetch.push(id);
        }
      }

      // Collect BATCH_SIZE going down from middle (exclusive)
      const downEnd = Math.min(segmentIds.length - 1, middleIdx + BATCH_SIZE);
      for (let i = middleIdx + 1; i <= downEnd; i++) {
        const id = segmentIds[i];
        if (id && segments.get(id)?.status === "pending") {
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
    [$store, utils],
  );

  return {
    onRangeChange,
  };
}

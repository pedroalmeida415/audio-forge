"use client";

import { useValue } from "@legendapp/state/react";
import { Loader2, XSquare } from "lucide-react";
import { useCallback } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { SegmentRow } from "./segment-row";

export function SegmentsList() {
  const $store = useSpeakerPageStore();
  const segments = useValue($store.segments);
  const selectedIds = useValue($store.selectedSegmentIds);
  const hasMore = useValue($store.hasMore);
  const isLoadingMore = useValue($store.isLoadingMore);
  const nextCursor = useValue($store.nextCursor);
  const speakerId = useValue($store.speakerId);

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;
  const allSelected = selectedCount === segments.length && segments.length > 0;

  const segmentsQuery = api.segment.getBySpeaker.useQuery(
    { speakerId, cursor: nextCursor, limit: 50 },
    { enabled: false }, // Manual fetch only for load more
  );

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;

    $store.setIsLoadingMore(true);

    try {
      const result = await segmentsQuery.refetch();
      if (result.data) {
        $store.appendSegments(result.data.items);
        $store.setNextCursor(result.data.nextCursor);
        $store.setHasMore(!!result.data.nextCursor);
      }
    } finally {
      $store.setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, segmentsQuery, $store]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          No segments found for this speaker.
        </p>
      </div>
    );
  }

  const handleSelectAllToggle = () => {
    if (allSelected) {
      $store.clearSelection();
    } else {
      $store.selectAll();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* List header with selection controls */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAllToggle}
          />
          <span className="text-muted-foreground text-sm">
            {selectedCount > 0
              ? `${selectedCount} of ${segments.length} selected`
              : `${segments.length} segments`}
          </span>
        </div>
        {hasSelection && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => $store.clearSelection()}
          >
            <XSquare className="size-3.5" />
            Clear selection
          </Button>
        )}
      </div>

      {/* Segments */}
      {segments.map((segment) => (
        <SegmentRow key={segment.id} segment={segment} />
      ))}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useValue } from "@legendapp/state/react";
import { Check, Filter, Loader2, X } from "lucide-react";
import { useCallback } from "react";
import { Button } from "~/components/ui/button";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { FilterBar } from "./filter-bar";
import { SegmentCard } from "./segment-card";

export function SegmentsList() {
  const $store = useSpeakerPageStore();
  const segments = useValue($store.segments);
  const selectedIds = useValue($store.selectedSegmentIds);
  const hasMore = useValue($store.hasMore);
  const isLoadingMore = useValue($store.isLoadingMore);
  const nextCursor = useValue($store.nextCursor);
  const speakerId = useValue($store.speakerId);

  const filteredSegments = $store.getFilteredSegments();
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const segmentsQuery = api.segment.getBySpeaker.useQuery(
    { speakerId, cursor: nextCursor, limit: 50 },
    { enabled: false },
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

  const handleSelectAll = () => {
    $store.selectAll();
  };

  const handleClearSelection = () => {
    $store.clearSelection();
  };

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          No segments found for this speaker.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Bar */}
      <FilterBar />

      {/* Header with selection controls and count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="border-border bg-secondary text-foreground"
          >
            <Check className="size-3.5" />
            Select All
          </Button>
          {hasSelection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-secondary-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear
            </Button>
          )}
          {hasSelection && (
            <span className="text-secondary-foreground text-sm">
              {selectedCount} selected
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-sm">
          Showing {filteredSegments.length} of {segments.length} segments
        </span>
      </div>

      {/* Segments */}
      {filteredSegments.length > 0 ? (
        <div className="flex flex-col gap-4">
          {filteredSegments.map((segment, index) => (
            <SegmentCard key={segment.id} segment={segment} index={index} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/50 border-dashed bg-secondary/30 py-16">
          <Filter className="size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground text-sm">
            No segments match your filters
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => $store.resetFilters()}
            className="mt-2 text-secondary-foreground hover:text-primary"
          >
            Clear filters
          </Button>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="border-border bg-secondary text-foreground"
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

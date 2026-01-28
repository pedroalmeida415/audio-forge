"use client";

import { useValue } from "@legendapp/state/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Filter, Loader2, X } from "lucide-react";
import { useCallback, useRef } from "react";
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
  const filters = useValue($store.filters);

  const filteredSegments = $store.getFilteredSegments();
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualize the segments list for performance
  const virtualizer = useVirtualizer({
    count: filteredSegments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250, // Estimated card height in px
    overscan: 3,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

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

  // Key based on filter state to reset scroll position when filters change
  const filterKey = JSON.stringify(filters);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      {/* Filter Bar */}
      <FilterBar />

      {/* Header with selection controls and count */}
      <div className="flex shrink-0 items-center justify-between">
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

      {/* Virtualized Segments List */}
      {filteredSegments.length > 0 ? (
        <div
          key={filterKey}
          ref={parentRef}
          className="min-h-0 flex-1 overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const segment = filteredSegments[virtualRow.index];
              if (!segment) return null;
              return (
                <div
                  key={segment.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: "1rem", // Gap between cards
                  }}
                >
                  <SegmentCard segment={segment} index={virtualRow.index} />
                </div>
              );
            })}
          </div>

          {/* Load More button inside scroll container */}
          {hasMore && (
            <div className="flex justify-center py-4">
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
    </div>
  );
}

"use client";

import { useValue } from "@legendapp/state/react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { Check, X } from "lucide-react";
import { useCallback, useRef } from "react";
import { Button } from "~/components/ui/button";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useWindowedSegments } from "~/features/speaker/hooks/use-windowed-segments";
import { SegmentCard, SegmentCardSkeleton } from "./segment-card";

export function SegmentsList() {
  const $store = useSpeakerPageStore();
  const selectedIds = useValue($store.selectedSegmentIds);

  const { totalCount, getSegmentIdAt, onRangeChange } = useWindowedSegments();

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const parentRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notify windowed segments hook when scrolling stops (with small debounce)
  const handleVirtualizerChange = useCallback(
    (instance: Virtualizer<HTMLDivElement, Element>, sync: boolean) => {
      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      // sync=true means scrolling in progress
      if (sync) return;

      // Small debounce to filter out false positives
      debounceRef.current = setTimeout(() => {
        const items = instance.getVirtualItems();
        if (items.length > 0) {
          const first = items[0];
          const last = items[items.length - 1];
          if (first && last) {
            onRangeChange(first.index, last.index);
          }
        }
      }, 50);
    },
    [onRangeChange],
  );

  // Virtualize the segments list for performance
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250, // Estimated card height in px
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
    onChange: handleVirtualizerChange,
  });

  const handleSelectAll = () => {
    $store.selectAll();
  };

  const handleClearSelection = () => {
    $store.clearSelection();
  };

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          No segments found for this speaker.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
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
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {totalCount} segments
          </span>
        </div>
      </div>

      {/* Virtualized Segments List */}
      {totalCount > 0 ? (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const segmentId = getSegmentIdAt(virtualRow.index);
              return (
                <div
                  key={virtualRow.key}
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
                  {segmentId ? (
                    <SegmentCard
                      segmentId={segmentId}
                      index={virtualRow.index}
                    />
                  ) : (
                    <SegmentCardSkeleton index={virtualRow.index} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">No segments found.</p>
        </div>
      )}
    </div>
  );
}

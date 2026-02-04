"use client";

import { useValue } from "@legendapp/state/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useWindowedSegments } from "~/features/speaker/hooks/use-windowed-segments";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";
import { createColumns } from "./columns";
import { TableToolbar } from "./table-toolbar";

const columns = createColumns();

// Grid column template: select | index | original | delta | processed | duration | transcription | tags (flex)
const GRID_COLUMNS = "40px 60px 220px 50px 220px 80px 400px 1fr";

// Row height for virtualization
const ROW_HEIGHT = 48;

// ============================================================================
// Segment Row Component (subscribes to its own entry)
// ============================================================================

interface SegmentRowProps {
  segmentId: string;
  index: number;
}

function SegmentRow({ segmentId, index }: SegmentRowProps) {
  const $store = useSpeakerPageStore();

  // Subscribe to this specific segment entry
  const entry = useValue($store.segments.get(segmentId));
  const segment = entry?.status === "loaded" && entry.data ? entry.data : null;

  if (!segment) {
    return <SkeletonRow />;
  }

  return <LoadedRow segment={segment} index={index} />;
}

// ============================================================================
// Loaded Row Component
// ============================================================================

interface LoadedRowProps {
  segment: SegmentWithClip;
  index: number;
}

function LoadedRow({ segment, index }: LoadedRowProps) {
  const $store = useSpeakerPageStore();

  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(segment.id),
  );

  const table = useReactTable({
    data: [segment],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const row = table.getRowModel().rows[0];
  if (!row) return null;

  return (
    <div
      role="row"
      className={cn(
        "group/row grid items-center border-border/50 border-b transition-colors",
        isSelected && "bg-primary/5",
        !isSelected && "hover:bg-muted/50",
      )}
      style={{ gridTemplateColumns: GRID_COLUMNS }}
      data-segment-id={segment.id}
    >
      {row.getVisibleCells().map((cell) => (
        <div key={cell.id} role="cell" className="px-2 py-2">
          {flexRender(cell.column.columnDef.cell, {
            ...cell.getContext(),
            row: { ...cell.getContext().row, index },
          })}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Skeleton Row Component
// ============================================================================

function SkeletonRow() {
  return (
    <div
      role="row"
      className="grid items-center border-border/50 border-b"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      {/* Select */}
      <div className="px-2 py-2">
        <Skeleton className="size-4 rounded" />
      </div>
      {/* Index */}
      <div className="px-2 py-2">
        <Skeleton className="h-4 w-12" />
      </div>
      {/* Original */}
      <div className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
          <Skeleton className="h-6 w-10" />
        </div>
      </div>
      {/* Delta */}
      <div className="px-2 py-2">
        <div className="flex flex-col items-center gap-0.5">
          <Skeleton className="size-4" />
          <Skeleton className="h-3 w-6" />
        </div>
      </div>
      {/* Processed */}
      <div className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
          <Skeleton className="h-6 w-10" />
        </div>
      </div>
      {/* Duration */}
      <div className="flex justify-center px-2 py-2">
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
      {/* Transcription */}
      <div className="px-2 py-2">
        <Skeleton className="h-4 w-full" />
      </div>
      {/* Tags */}
      <div className="px-2 py-2">
        <div className="flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Grid Header Component
// ============================================================================

function GridHeader() {
  const headerTable = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div role="rowgroup" className="bg-muted/95">
      {headerTable.getHeaderGroups().map((headerGroup) => (
        <div
          key={headerGroup.id}
          role="row"
          className="grid items-center border-b"
          style={{ gridTemplateColumns: GRID_COLUMNS }}
        >
          {headerGroup.headers.map((header) => (
            <div
              key={header.id}
              role="columnheader"
              className="px-2 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide"
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Table Component
// ============================================================================

export function SegmentsTable() {
  const { totalCount, getSegmentIdAt, onRangeChange } = useWindowedSegments();

  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notify windowed segments hook when scrolling stops
  const handleVirtualizerChange = useCallback(
    (instance: Virtualizer<Window, Element>, sync: boolean) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (sync) return;

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

  const virtualizer = useWindowVirtualizer({
    count: totalCount,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    onChange: handleVirtualizerChange,
  });

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <TableToolbar />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            No segments found for this speaker.
          </p>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      role="table"
      className="overflow-clip rounded-lg border border-border bg-card"
    >
      {/* Single sticky container for toolbar + header */}
      <div className="sticky top-14 z-10 rounded-t-lg bg-card">
        <TableToolbar />
        <GridHeader />
      </div>

      {/* Grid body - absolute positioning for virtualization */}
      <div
        ref={listRef}
        role="rowgroup"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const segmentId = getSegmentIdAt(virtualRow.index);
          // Subtract scrollMargin since item.start includes it but our container is already below the sticky header
          const offsetY = virtualRow.start - virtualizer.options.scrollMargin;

          return (
            <div
              key={segmentId ?? virtualRow.index}
              className="absolute left-0 w-full"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {segmentId ? (
                <SegmentRow segmentId={segmentId} index={virtualRow.index} />
              ) : (
                <SkeletonRow />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

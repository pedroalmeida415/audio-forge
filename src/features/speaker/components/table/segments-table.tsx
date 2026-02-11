"use client";

import { useValue } from "@legendapp/state/react";
import {
  flexRender,
  getCoreRowModel,
  type Row,
  useReactTable,
} from "@tanstack/react-table";
import {
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useWindowedSegments } from "~/features/speaker/hooks/use-windowed-segments";
import {
  ActionsCell,
  createColumns,
  DurationCell,
  IndexCell,
  OriginalAudioCell,
  ProcessedAudioCell,
  ScoreCell,
  SelectCell,
} from "./columns";
import { TableToolbar } from "./table-toolbar";
import { TagsCell } from "./tags-cell";
import { TranscriptionCell } from "./transcription-cell";

const columns = createColumns();

// Grid column template: select | index | original | processed | score | duration | transcription | tags (flex) | actions
const GRID_COLUMNS = "40px 60px 48px 48px 60px 80px 1fr 200px 48px";

// Row height for virtualization
const ROW_HEIGHT = 48;

// ============================================================================
// Segment Row Component
// ============================================================================

interface TableRowProps {
  row: Row<string>;
}

function TableRow({ row }: TableRowProps) {
  const $store = useSpeakerPageStore();
  const segmentId = row.original;
  const entry = useValue($store.segments.get(segmentId));

  if (entry?.status !== "loaded" || !entry.data) {
    return <SkeletonRow />;
  }

  const segment = entry.data;
  const duration = segment.endTime - segment.startTime;

  return (
    <div
      role="row"
      className="group/row grid items-center border-border/50 border-b transition-colors hover:bg-muted/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:hover:bg-primary/5"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
      data-segment-id={row.id}
    >
      <div role="cell" className="px-2 py-2">
        <SelectCell segmentId={segmentId} />
      </div>
      <div role="cell" className="px-2 py-2">
        <IndexCell index={row.index} />
      </div>
      <div role="cell" className="px-2 py-2">
        <OriginalAudioCell
          storageKey={segment.source.storageKey ?? ""}
          startTime={segment.startTime}
          endTime={segment.endTime}
        />
      </div>
      <div role="cell" className="px-2 py-2">
        <ProcessedAudioCell
          segmentId={segmentId}
          clipStorageKey={segment.clip?.storageKey ?? null}
          clipDuration={segment.clip?.duration ?? null}
          fallbackDuration={duration}
        />
      </div>
      <div role="cell" className="px-2 py-2">
        <ScoreCell score={segment.clip?.scores?.DNSMOS?.P808_MOS ?? null} />
      </div>
      <div role="cell" className="px-2 py-2">
        <DurationCell duration={duration} />
      </div>
      <div role="cell" className="px-2 py-2">
        <TranscriptionCell transcription={segment.transcription} />
      </div>
      <div role="cell" className="px-2 py-2">
        <TagsCell tags={segment.tags} segmentId={segmentId} />
      </div>
      <div role="cell" className="px-2 py-2">
        <ActionsCell segmentId={segmentId} />
      </div>
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
        </div>
      </div>
      {/* Processed */}
      <div className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
        </div>
      </div>
      {/* Score */}
      <div className="flex justify-center px-2 py-2">
        <Skeleton className="h-7 w-10" />
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
      {/* Actions - empty for skeleton */}
      <div className="px-2 py-2" />
    </div>
  );
}

// ============================================================================
// Main Table Component
// ============================================================================

export function SegmentsTable() {
  const $store = useSpeakerPageStore();

  const [data, _setData] = useState(() => Array.from($store.segments.keys()));

  const { onRangeChange } = useWindowedSegments();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row,
  });

  const { rows } = table.getRowModel();

  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    onChange: handleVirtualizerChange,
  });

  // Notify windowed segments hook when scrolling stops
  function handleVirtualizerChange(
    instance: Virtualizer<Window, Element>,
    sync: boolean,
  ) {
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
  }

  if (rows.length === 0) {
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
        <div role="rowgroup" className="bg-muted/95">
          {table.getHeaderGroups().map((headerGroup) => (
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
                  className="px-2 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Grid body - absolute positioning for virtualization */}
      <div
        ref={listRef}
        role="rowgroup"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (!row) return null;

          // Subtract scrollMargin since item.start includes it but our container is already below the sticky header
          const offsetY = virtualRow.start - virtualizer.options.scrollMargin;

          return (
            <div
              key={row.id}
              className="absolute left-0 w-full"
              style={{
                transform: `translateY(${offsetY}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              <TableRow row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import type { Table } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import { usePlaybackContext } from "../../_context/playback.context";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import { filterSegments, getUniqueSpeakers } from "../../_utils/segment-utils";
import { createColumns, type TableSegment } from "./columns";

// Row heights for virtualization
const ROW_HEIGHT = 44;

// Virtual row types - simplified to segment only since we always have a speaker selected
type VirtualRowData = { type: "segment"; segment: TableSegment };

// Memoized segment row - renders its own cells using getRow
const SegmentRowItem = memo(function SegmentRowItem({
  segmentId,
  colorIndex,
  isSelected,
  start,
  size,
  onSelect,
  getRow,
}: {
  segmentId: string;
  colorIndex: number;
  isSelected: boolean;
  start: number;
  size: number;
  onSelect: (id: string) => void;
  getRow: (id: string) => ReturnType<Table<TableSegment>["getRow"]>;
}) {
  const color = getSpeakerColor(colorIndex);
  const tableRow = getRow(segmentId);

  if (!tableRow) return null;

  return (
    <button
      type="button"
      className={cn(
        "group/row flex w-full cursor-pointer items-center border-border/50 border-b px-4 py-2 text-left transition-colors",
        isSelected && "bg-primary/5",
        !isSelected && "hover:bg-muted/50",
      )}
      onClick={() => onSelect(segmentId)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: size,
        transform: `translateY(${start}px)`,
        borderLeftWidth: 3,
        borderLeftColor: color.border,
      }}
    >
      {tableRow.getVisibleCells().map((cell) => (
        <div
          key={cell.id}
          className="flex items-center"
          style={{ width: cell.column.getSize() }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </button>
  );
});

// Props for the isolated virtualizer component
interface VirtualizedTableBodyProps {
  virtualRows: VirtualRowData[];
  onSelectSegment: (id: string) => void;
  getRow: (id: string) => ReturnType<Table<TableSegment>["getRow"]>;
  selectedIds: Set<string>;
}

// Custom comparison to prevent unnecessary re-renders
function arePropsEqual(
  prevProps: VirtualizedTableBodyProps,
  nextProps: VirtualizedTableBodyProps,
): boolean {
  return (
    prevProps.virtualRows === nextProps.virtualRows &&
    prevProps.onSelectSegment === nextProps.onSelectSegment &&
    prevProps.getRow === nextProps.getRow &&
    prevProps.selectedIds === nextProps.selectedIds
  );
}

// Isolated virtualizer component - only re-renders on scroll, not on parent state changes
const VirtualizedTableBody = memo(function VirtualizedTableBody({
  virtualRows,
  onSelectSegment,
  getRow,
  selectedIds,
}: VirtualizedTableBodyProps) {
  // Track if we have a valid scroll element
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  // Setup virtualizer - only when we have a scroll element
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    enabled: !!scrollElement,
  });

  // Callback ref to set scroll element
  const setParentRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setScrollElement(node);
    }
  }, []);

  return (
    <div ref={setParentRef} className="flex-1 overflow-auto">
      <div
        className="relative min-w-[800px]"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowData = virtualRows[virtualRow.index];
          if (!rowData) return null;

          return (
            <SegmentRowItem
              key={rowData.segment.id}
              segmentId={rowData.segment.id}
              colorIndex={rowData.segment.colorIndex}
              isSelected={selectedIds.has(rowData.segment.id)}
              start={virtualRow.start}
              size={virtualRow.size}
              onSelect={onSelectSegment}
              getRow={getRow}
            />
          );
        })}

        {/* Empty state */}
        {virtualRows.length === 0 && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            No segments found
          </div>
        )}
      </div>
    </div>
  );
}, arePropsEqual);

// Table header component
const TableHeader = memo(function TableHeader({
  table,
}: {
  table: Table<TableSegment>;
}) {
  return (
    <div className="shrink-0 border-b bg-muted/95 px-4 py-2">
      {table.getHeaderGroups().map((headerGroup) => (
        <div key={headerGroup.id} className="flex w-full items-center">
          {headerGroup.headers.map((header) => (
            <div
              key={header.id}
              className="flex items-center font-medium text-muted-foreground text-xs uppercase tracking-wide"
              style={{ width: header.getSize() }}
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
});

export function SegmentsTable() {
  const segmentsById = useClippingWorkspaceStore((s) => s.segmentsById);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);
  const selectedSegmentIds = useClippingWorkspaceStore(
    (s) => s.selectedSegmentIds,
  );
  const filters = useClippingWorkspaceStore((s) => s.filters);
  const setSortBy = useClippingWorkspaceStore((s) => s.setSortBy);
  const setSelectedSegmentIds = useClippingWorkspaceStore(
    (s) => s.setSelectedSegmentIds,
  );
  const archiveSegment = useClippingWorkspaceStore((s) => s.archiveSegment);
  const selectSegment = useClippingWorkspaceStore((s) => s.selectSegment);

  const { handleSegmentPlay } = usePlaybackContext();

  // TanStack Table sorting state
  const [sorting, setSorting] = useState<SortingState>([]);

  // Sync store sortBy with TanStack sorting
  useEffect(() => {
    if (sorting.length > 0) {
      const sort = sorting[0];
      if (sort) {
        setSortBy({
          column: sort.id as "duration" | "reviewed" | "alerts",
          direction: sort.desc ? "desc" : "asc",
        });
      }
    } else {
      setSortBy(null);
    }
  }, [sorting, setSortBy]);

  // Get speaker order for color assignment
  const speakerOrder = useMemo(() => {
    const segments = Object.values(segmentsById);
    return getUniqueSpeakers(segments);
  }, [segmentsById]);

  // Prepare table data
  const tableData = useMemo(() => {
    const allSegments = Object.values(segmentsById);
    const filtered = filterSegments(allSegments, filters, selectedSpeaker);
    const sortedByTime = [...filtered].sort((a, b) => a.start - b.start);

    const withMetadata: TableSegment[] = sortedByTime.map((segment, idx) => ({
      ...segment,
      index: idx,
      colorIndex: speakerOrder.indexOf(segment.speaker),
    }));

    return withMetadata;
  }, [segmentsById, filters, selectedSpeaker, speakerOrder]);

  // Build flat virtualized rows - always single speaker view
  const virtualRows = useMemo(() => {
    return tableData.map((segment): VirtualRowData => ({ type: "segment", segment }));
  }, [tableData]);

  // Column definitions
  const columns = useMemo(
    () =>
      createColumns({
        onPlay: handleSegmentPlay,
        onChangeSpeaker: (segmentId) => {
          console.log("Change speaker for:", segmentId);
        },
        onDelete: archiveSegment,
      }),
    [handleSegmentPlay, archiveSegment],
  );

  // Memoize row selection state to avoid recreating on every render
  const rowSelection = useMemo(
    () =>
      Object.fromEntries(
        Array.from(selectedSegmentIds).map((id) => [id, true]),
      ),
    [selectedSegmentIds],
  );

  // Memoize onRowSelectionChange callback
  const handleRowSelectionChange = useCallback(
    (
      updater:
        | ((old: Record<string, boolean>) => Record<string, boolean>)
        | Record<string, boolean>,
    ) => {
      const newSelection =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setSelectedSegmentIds(
        new Set(Object.keys(newSelection).filter((k) => newSelection[k])),
      );
    },
    [rowSelection, setSelectedSegmentIds],
  );

  // Create table instance
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
      rowSelection,
    },
    getRowId: (row) => row.id,
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: true,
  });

  // Use ref to store getRow for stable reference
  const getRowRef = useRef(table.getRow);
  getRowRef.current = table.getRow;

  // Stable getRow function that uses ref
  const getRow = useCallback((id: string) => getRowRef.current(id), []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Fixed table header */}
      <TableHeader table={table} />

      {/* Isolated virtualized body - won't re-render on parent state changes */}
      <VirtualizedTableBody
        virtualRows={virtualRows}
        onSelectSegment={selectSegment}
        getRow={getRow}
        selectedIds={selectedSegmentIds}
      />
    </div>
  );
}

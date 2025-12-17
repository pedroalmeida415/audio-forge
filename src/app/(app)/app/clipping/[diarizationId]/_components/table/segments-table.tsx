"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { memo, useCallback, useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import type { FilterConfig } from "../../_store/types";
import { getUniqueSpeakers } from "../../_utils/segment-utils";
import { createColumns, type TableSegment } from "./columns";

interface TableRowProps {
  row: Row<TableSegment>;
  isSelected: boolean;
  onRowClick: (rowId: string) => void;
}

// Memoized with custom comparison to prevent re-renders when only sort order changes.
// TanStack Table creates new Row wrapper objects on every state change, but
// the underlying data (row.original) is stable. We only re-render if:
// - The actual segment data changed
// - Selection state changed
// - The click handler changed
const TableRow = memo(
  function TableRow({ row, isSelected, onRowClick }: TableRowProps) {
    return (
      <tr
        className={cn(
          "group/row cursor-pointer border-border/50 border-b transition-colors",
          isSelected && "bg-primary/5",
          !isSelected && "hover:bg-muted/50",
        )}
        onClick={() => onRowClick(row.id)}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cn(
              "px-3 py-2",
              cell.column.id === "transcription" && "w-full",
            )}
            style={
              cell.column.id !== "transcription"
                ? { width: cell.column.getSize() }
                : undefined
            }
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  },
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.row.original === next.row.original &&
    prev.isSelected === next.isSelected &&
    prev.onRowClick === next.onRowClick,
);

export function SegmentsTable() {
  // Get store API for direct state access (avoids stale closures)
  const store = useClippingStore();

  const segmentsById = useClippingStore((s) => s.segments.segmentsById);
  const selectedSpeaker = useClippingStore((s) => s.segments.selectedSpeaker);
  const selectedSegmentIds = useClippingStore(
    (s) => s.segments.selectedSegmentIds,
  );
  const setSelectedSegmentIds = useClippingStore(
    (s) => s.segments.setSelectedSegmentIds,
  );
  const archiveSegment = useClippingStore((s) => s.segments.archiveSegment);
  const selectSegment = useClippingStore((s) => s.segments.selectSegment);

  const { handleSegmentPlay } = usePlayback();

  // Local UI state (not shared across components)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, _setFilters] = useState<FilterConfig>({
    reviewed: null,
  });

  // Pre-compute speaker index map for O(1) lookups instead of O(n) indexOf calls
  const speakerIndexMap = useMemo(() => {
    const speakerOrder = getUniqueSpeakers(Object.values(segmentsById));
    return new Map(speakerOrder.map((speaker, idx) => [speaker, idx]));
  }, [segmentsById]);

  // Pre-group segments by speaker - only recomputes when segmentsById changes.
  // Each speaker's segments are pre-sorted by start time and pre-transformed
  // to TableSegment format. This avoids filtering/sorting all 302 segments
  // on every speaker selection change.
  const segmentsBySpeaker = useMemo(() => {
    const map = new Map<string, TableSegment[]>();
    const allSegments = Object.values(segmentsById);

    // Group by speaker (using base SegmentWithId type first)
    const groupedRaw = new Map<string, typeof allSegments>();
    for (const segment of allSegments) {
      if (segment.isDeleted) continue;
      const list = groupedRaw.get(segment.speaker) || [];
      list.push(segment);
      groupedRaw.set(segment.speaker, list);
    }

    // Sort each group by start time and transform to TableSegment
    for (const [speaker, segments] of groupedRaw) {
      segments.sort((a, b) => a.start - b.start);
      const colorIndex = speakerIndexMap.get(speaker) ?? -1;
      const tableSegments: TableSegment[] = segments.map((segment, i) => ({
        ...segment,
        index: i,
        colorIndex,
      }));
      map.set(speaker, tableSegments);
    }

    return map;
  }, [segmentsById, speakerIndexMap]);

  // Get table data for selected speaker - fast O(1) lookup into pre-computed map
  // Only creates new array reference when speaker actually changes
  const tableData = useMemo(() => {
    if (!selectedSpeaker) return [];

    // Apply additional filters if needed
    const segments = segmentsBySpeaker.get(selectedSpeaker) || [];
    if (filters.reviewed === null) {
      return segments;
    }

    // Only filter if reviewed filter is active
    return segments.filter((s) => {
      const isReviewed = s.isReviewed ?? false;
      return filters.reviewed === isReviewed;
    });
  }, [selectedSpeaker, segmentsBySpeaker, filters.reviewed]);

  // Callback for changing speaker - memoized for TanStack Table reference stability
  const handleChangeSpeaker = useCallback((segmentId: string) => {
    console.log("Change speaker for:", segmentId);
  }, []);

  // Column definitions - memoized because TanStack Table relies on reference equality
  // Without this, table recalculates row models on every render
  const columns = useMemo(
    () =>
      createColumns({
        onPlay: handleSegmentPlay,
        onChangeSpeaker: handleChangeSpeaker,
        onDelete: archiveSegment,
      }),
    [handleSegmentPlay, handleChangeSpeaker, archiveSegment],
  );

  // Row selection state - memoized for TanStack Table reference stability
  const rowSelection = useMemo(
    () =>
      Object.fromEntries(
        Array.from(selectedSegmentIds).map((id) => [id, true]),
      ),
    [selectedSegmentIds],
  );

  // Handle row selection change - memoized for TanStack Table reference stability
  // Uses store.getState() to avoid stale closures
  const handleRowSelectionChange = useCallback(
    (
      updater:
        | ((old: Record<string, boolean>) => Record<string, boolean>)
        | Record<string, boolean>,
    ) => {
      // Get current selection directly from store to avoid stale closure
      const currentIds = store.getState().segments.selectedSegmentIds;
      const currentRowSelection = Object.fromEntries(
        Array.from(currentIds).map((id) => [id, true]),
      );

      const newSelection =
        typeof updater === "function" ? updater(currentRowSelection) : updater;

      const newSelectedIds = Object.keys(newSelection).filter(
        (k) => newSelection[k],
      );

      // Only update if selection actually changed
      if (
        newSelectedIds.length !== currentIds.size ||
        !newSelectedIds.every((id) => currentIds.has(id))
      ) {
        setSelectedSegmentIds(new Set(newSelectedIds));
      }
    },
    [store, setSelectedSegmentIds],
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide",
                      header.id === "transcription" && "w-full",
                    )}
                    style={
                      header.id !== "transcription"
                        ? { width: header.getSize() }
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table
                .getRowModel()
                .rows.map((row) => (
                  <TableRow
                    key={row.id}
                    row={row}
                    isSelected={row.getIsSelected()}
                    onRowClick={selectSegment}
                  />
                ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  No segments found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

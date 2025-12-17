"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import type { FilterConfig } from "../../_store/types";
import { filterSegments, getUniqueSpeakers } from "../../_utils/segment-utils";
import { createColumns, type TableSegment } from "./columns";

interface TableRowProps {
  row: Row<TableSegment>;
  isSelected: boolean;
  onRowClick: (rowId: string) => void;
}

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
}

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

  const playbackContext = usePlayback();

  // Local UI state (not shared across components)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, _setFilters] = useState<FilterConfig>({
    reviewed: null,
  });

  // Pre-compute speaker index map for O(1) lookups instead of O(n) indexOf calls
  // Memoized because it's used as a dependency for tableData
  const speakerIndexMap = useMemo(() => {
    const speakerOrder = getUniqueSpeakers(Object.values(segmentsById));
    return new Map(speakerOrder.map((speaker, idx) => [speaker, idx]));
  }, [segmentsById]);

  // Prepare table data - memoized to prevent TanStack Table from seeing "new" data
  // on every render, which would trigger auto-reset behavior and cause infinite loops.
  // Note: React Compiler doesn't handle this case correctly, likely because
  // useReactTable internally depends on referential stability of data.
  const tableData = useMemo(() => {
    const allSegments = Object.values(segmentsById);
    const filtered = filterSegments(allSegments, filters, selectedSpeaker);
    const sortedByTime = [...filtered].sort((a, b) => a.start - b.start);
    return sortedByTime.map((segment, idx) => ({
      ...segment,
      index: idx,
      colorIndex: speakerIndexMap.get(segment.speaker) ?? -1,
    }));
  }, [segmentsById, filters, selectedSpeaker, speakerIndexMap]);

  // Callback for changing speaker
  const handleChangeSpeaker = (segmentId: string) => {
    console.log("Change speaker for:", segmentId);
  };

  // Column definitions
  const columns = createColumns({
    onPlay: playbackContext.handleSegmentPlay,
    onChangeSpeaker: handleChangeSpeaker,
    onDelete: archiveSegment,
  });

  // Row selection state
  const rowSelection = Object.fromEntries(
    Array.from(selectedSegmentIds).map((id) => [id, true]),
  );

  // Handle row selection change - uses store.getState() to avoid rowSelection dependency
  const handleRowSelectionChange = (
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
  };

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

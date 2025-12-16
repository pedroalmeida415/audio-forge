"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { usePlaybackContext } from "../../_context/playback.context";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import { filterSegments, getUniqueSpeakers } from "../../_utils/segment-utils";
import { createColumns, type TableSegment } from "./columns";

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

  // Memoize row selection state
  const rowSelection = useMemo(
    () =>
      Object.fromEntries(
        Array.from(selectedSegmentIds).map((id) => [id, true]),
      ),
    [selectedSegmentIds],
  );

  // Handle row selection change
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
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "group/row cursor-pointer border-b border-border/50 transition-colors",
                    row.getIsSelected() && "bg-primary/5",
                    !row.getIsSelected() && "hover:bg-muted/50",
                  )}
                  onClick={() => selectSegment(row.id)}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
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

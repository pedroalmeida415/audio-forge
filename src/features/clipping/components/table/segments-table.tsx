"use client";

import type { Observable } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useRef, useState } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { cn } from "~/lib/utils";
import type { Segment } from "~/server/db/schema";
import { createColumns } from "./columns";

const columns = createColumns();

interface TableRowProps {
  row: Row<Observable<Segment>>;
}

// Memoized with custom comparison to prevent re-renders when only sort order changes.
// TanStack Table creates new Row wrapper objects on every state change, but
// the underlying data (row.original) is stable. Selection/active state is
// subscribed to directly from the store within this component.

function TableRow({ row }: TableRowProps) {
  const $store = useClippingStore();
  const segmentId = row.original.id.peek();

  // Subscribe directly to selection state for this specific segment
  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(segmentId),
  );
  const isActive = useValue(() => $store.activeSegmentId.get() === row.id);

  return (
    <tr
      className={cn(
        "group/row cursor-pointer border-border/50 border-b transition-colors",
        isActive && "ring-2 ring-primary ring-inset",
        isSelected && !isActive && "bg-primary/5",
        !isSelected && !isActive && "hover:bg-muted/50",
      )}
      data-segment-id={segmentId}
      onClick={() => $store.setActiveSegment(row.id)}
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
  const $store = useClippingStore();

  // Local UI state (not shared across components)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [data, setData] = useState<Observable<Segment>[]>(
    $store.segmentsBySpeaker.get().get($store.selectedSpeakerId.get()!) ?? [],
  );

  // Ref for scrollable table container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    getRowId: (row) => row.id.peek(),
  });

  // Subscribe to segment changes outside of render cycle and after component mounts
  useObserveEffect(() => {
    const data =
      $store.segmentsBySpeaker.get().get($store.selectedSpeakerId.get()!) ?? [];

    setData(data);
  });

  // Scroll to active segment when it changes (bi-directional navigation)
  useObserveEffect(() => {
    const activeId = $store.activeSegmentId.get();
    if (!activeId || !tableContainerRef.current) return;

    // Find the row element by data-segment-id attribute
    const row = tableContainerRef.current.querySelector(
      `tr[data-segment-id="${activeId}"]`,
    );

    if (row) {
      requestAnimationFrame(() =>
        row.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      );
    }
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
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
                .rows.map((row) => <TableRow key={row.id} row={row} />)
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

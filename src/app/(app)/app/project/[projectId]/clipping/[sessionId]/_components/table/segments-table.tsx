"use client";

import { observe } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useClippingStore } from "../../_context/store.context";
import type { SegmentWithSpeaker } from "../../_store/clipping-store";
import { createColumns } from "./columns";

const columns = createColumns();

interface TableRowProps {
  row: Row<SegmentWithSpeaker>;
}

// Memoized with custom comparison to prevent re-renders when only sort order changes.
// TanStack Table creates new Row wrapper objects on every state change, but
// the underlying data (row.original) is stable. Selection/active state is
// subscribed to directly from the store within this component.

function TableRow({ row }: TableRowProps) {
  const $store = useClippingStore();

  // Subscribe directly to selection state for this specific segment
  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(row.original.id),
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
      data-segment-id={row.original.id}
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
  const [data, setData] = useState<SegmentWithSpeaker[]>([]);

  // Ref for scrollable table container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to segment changes outside of render cycle and after component mounts
  useObserveEffect(() => {
    const data = $store.segments
      .filter(($seg) => $seg.speakerId.get() === $store.selectedSpeakerId.get())
      .map(($seg) => $seg.peek());

    setData(data);
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    getRowId: (row) => row.id,
  });

  // Scroll to active segment when it changes (bi-directional navigation)
  useEffect(() => {
    const dispose = observe(() => {
      const activeId = $store.activeSegmentId.get();
      if (!activeId || !tableContainerRef.current) return;

      // Find the row element by data-segment-id attribute
      const row = tableContainerRef.current.querySelector(
        `tr[data-segment-id="${activeId}"]`,
      );

      if (row) {
        row.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    });

    return dispose;
  }, [$store]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table data-testid="segments-table" className="w-full border-collapse">
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

"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { createColumns } from "./columns";
import { SegmentsTableHeader } from "./segments-table-header";
import { SegmentsTableRow } from "./segments-table-row";
import { TableToolbar } from "./table-toolbar";

const columns = createColumns();
const ROW_HEIGHT = 48;

interface SegmentsTableProps {
  segments: SegmentWithClip[];
}

export function SegmentsTable({ segments }: SegmentsTableProps) {
  const table = useReactTable({
    data: segments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const { rows } = table.getRowModel();

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

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
      <SegmentsTableHeader table={table} />
      <div
        ref={listRef}
        role="rowgroup"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (!row) return null;

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
              <SegmentsTableRow row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

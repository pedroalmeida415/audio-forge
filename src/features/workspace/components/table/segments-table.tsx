"use client";

import {
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { createColumns } from "./columns";
import { SegmentsTableBody } from "./segments-table-body";
import { SegmentsTableHeader } from "./segments-table-header";

interface SegmentsTableProps {
  segments: SegmentWithClip[];
}

export function SegmentsTable({ segments }: SegmentsTableProps) {
  const columns = useMemo(() => createColumns(), []);
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: segments,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <table className="grid overflow-clip rounded-lg border border-border bg-card">
      <SegmentsTableHeader table={table} />
      {segments.length === 0 ? (
        <EmptyTableState />
      ) : (
        <SegmentsTableBody table={table} />
      )}
    </table>
  );
}

const EmptyTableState = () => (
  <tbody style={{ display: "block" }}>
    <tr style={{ display: "block" }}>
      <td style={{ display: "block" }}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            No segments found for this speaker.
          </p>
        </div>
      </td>
    </tr>
  </tbody>
);

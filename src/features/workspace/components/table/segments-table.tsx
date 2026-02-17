"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { createColumns } from "./columns";
import { SegmentsTableBody } from "./segments-table-body";
import { SegmentsTableHeader } from "./segments-table-header";
import { TableToolbar } from "./table-toolbar";

interface SegmentsTableProps {
  segments: SegmentWithClip[];
}

export function SegmentsTable({ segments }: SegmentsTableProps) {
  const columns = useMemo(() => createColumns(), []);
  const table = useReactTable({
    data: segments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  if (segments.length === 0) {
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

  return (
    <table className="grid overflow-clip rounded-lg border border-border bg-card">
      <SegmentsTableHeader table={table} />
      <SegmentsTableBody table={table} />
    </table>
  );
}

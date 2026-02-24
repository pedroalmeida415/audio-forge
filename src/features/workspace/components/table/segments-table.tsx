"use client";

import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data: segments,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    getRowId: (row) => row.id,
  });

  const hasSegments = segments.length > 0;
  const hasFilteredRows = table.getFilteredRowModel().rows.length > 0;

  return (
    <table className="grid overflow-clip rounded-lg border border-border bg-card">
      <SegmentsTableHeader table={table} />
      {!hasSegments ? (
        <EmptyTableState />
      ) : !hasFilteredRows ? (
        <EmptyFilterState onReset={() => table.resetColumnFilters()} />
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

const EmptyFilterState = ({ onReset }: { onReset: () => void }) => (
  <tbody style={{ display: "block" }}>
    <tr style={{ display: "block" }}>
      <td style={{ display: "block" }}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mb-4 text-muted-foreground text-sm">
            No segments match the current filters.
          </p>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="mr-2 size-4" />
            Clear Filters
          </Button>
        </div>
      </td>
    </tr>
  </tbody>
);

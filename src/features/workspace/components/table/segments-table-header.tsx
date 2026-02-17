"use client";

import { flexRender, type Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { cn } from "~/lib/utils";
import { TableToolbar } from "./table-toolbar";

interface SegmentsTableHeaderProps {
  table: Table<SegmentWithClip>;
}

export function SegmentsTableHeader({ table }: SegmentsTableHeaderProps) {
  "use no memo";
  return (
    <thead className="sticky top-14 z-10 grid rounded-t-lg bg-card">
      <tr style={{ display: "block" }}>
        <th className="block p-0 text-left font-normal">
          <TableToolbar />
        </th>
      </tr>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr
          key={headerGroup.id}
          className="flex w-full items-center border-b bg-muted/95"
        >
          {headerGroup.headers.map((header) => {
            const canSort = header.column.getCanSort();
            const sorted = header.column.getIsSorted();

            return (
              <th
                key={header.id}
                className={cn(
                  "flex items-center gap-1 px-2 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide",
                  header.column.columnDef.meta?.center && "justify-center",
                  canSort && "cursor-pointer select-none",
                )}
                style={
                  header.column.columnDef.meta?.flex
                    ? { flex: 1, minWidth: 0 }
                    : { width: header.getSize() }
                }
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
                {canSort &&
                  (sorted === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : sorted === "desc" ? (
                    <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3 opacity-50" />
                  ))}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

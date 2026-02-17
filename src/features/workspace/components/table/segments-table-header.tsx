"use client";

import { flexRender, type Table } from "@tanstack/react-table";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { cn } from "~/lib/utils";
import { TableToolbar } from "./table-toolbar";

interface SegmentsTableHeaderProps {
  table: Table<SegmentWithClip>;
}

export function SegmentsTableHeader({ table }: SegmentsTableHeaderProps) {
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
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              className={cn(
                "px-2 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide",
                header.column.columnDef.meta?.center && "text-center",
              )}
              style={
                header.column.columnDef.meta?.flex
                  ? { flex: 1, minWidth: 0 }
                  : { width: header.getSize() }
              }
            >
              {flexRender(
                header.column.columnDef.header,
                header.getContext(),
              )}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );
}

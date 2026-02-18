"use client";

import type { Table } from "@tanstack/react-table";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { SegmentsTableRow } from "./segments-table-row";

const ROW_HEIGHT = 48;

interface SegmentsTableBodyProps {
  table: Table<SegmentWithClip>;
}

export function SegmentsTableBody({ table }: SegmentsTableBodyProps) {
  const { rows } = table.getRowModel();
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: bodyRef.current?.offsetTop ?? 0,
  });

  return (
    <tbody
      ref={bodyRef}
      style={{
        display: "grid",
        height: `${virtualizer.getTotalSize()}px`,
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];

        if (!row) return null;

        const offsetY = virtualRow.start - virtualizer.options.scrollMargin;

        return (
          <SegmentsTableRow
            key={row.id}
            row={row}
            offsetY={offsetY}
            height={virtualRow.size}
          />
        );
      })}
    </tbody>
  );
}

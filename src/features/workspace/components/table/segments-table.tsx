"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { useWindowedSegments } from "~/features/workspace/hooks/use-windowed-segments";
import { createColumns } from "./columns";
import { SegmentsTableHeader } from "./segments-table-header";
import { SegmentsTableRow } from "./segments-table-row";
import { TableToolbar } from "./table-toolbar";

const columns = createColumns();
const ROW_HEIGHT = 48;

export function SegmentsTable() {
  const $store = useWorkspaceStore();
  const { segments } = useSnapshot($store);

  const [data, _setData] = useState(() => Array.from(segments.keys()));

  // useEffect(
  //   () =>
  //     subscribe($store.segments, () => {
  //       console.log("subscribe: $store.segments", $store.segments);
  //       setData(Array.from($store.segments.keys()));
  //     }),
  //   [],
  // );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row,
  });

  const { rows } = table.getRowModel();

  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    onChange: handleVirtualizerChange,
  });

  const { onRangeChange } = useWindowedSegments();

  function handleVirtualizerChange(
    instance: Virtualizer<Window, Element>,
    sync: boolean,
  ) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (sync) return;

    debounceRef.current = setTimeout(() => {
      const items = instance.getVirtualItems();
      if (items.length > 0) {
        const first = items[0];
        const last = items[items.length - 1];
        if (first && last) {
          onRangeChange(first.index, last.index);
        }
      }
    }, 50);
  }

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

import { flexRender, type Table } from "@tanstack/react-table";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { GRID_COLUMNS } from "./columns";
import { TableToolbar } from "./table-toolbar";

export function SegmentsTableHeader({
  table,
}: {
  table: Table<SegmentWithClip>;
}) {
  return (
    <div className="sticky top-14 z-10 rounded-t-lg bg-card">
      <TableToolbar />
      <div role="rowgroup" className="bg-muted/95">
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            key={headerGroup.id}
            role="row"
            className="grid items-center border-b"
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            {headerGroup.headers.map((header) => (
              <div
                key={header.id}
                role="columnheader"
                className="px-2 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

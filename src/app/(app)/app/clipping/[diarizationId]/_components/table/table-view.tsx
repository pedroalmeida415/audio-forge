"use client";

import { SegmentsTable } from "./segments-table";
import { TableToolbar } from "./table-toolbar";

export function TableView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TableToolbar />
      <SegmentsTable />
    </div>
  );
}

import { flexRender, type Row } from "@tanstack/react-table";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { cn } from "~/lib/utils";

interface SegmentsTableRowProps {
  row: Row<SegmentWithClip>;
  offsetY: number;
  height: number;
  isActive?: boolean;
}

export function SegmentsTableRow({
  row,
  offsetY,
  height,
  isActive,
}: SegmentsTableRowProps) {
  return (
    <tr
      className={cn(
        "group/row absolute left-0 flex w-full items-center border-border/50 border-b transition-colors hover:bg-muted/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:hover:bg-primary/5",
        isActive && "bg-primary/5 ring-1 ring-primary ring-inset",
      )}
      style={{
        transform: `translateY(${offsetY}px)`,
        height: `${height}px`,
      }}
      data-segment-id={row.id}
      key={row.id}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className={cn(
            "flex items-center px-2 py-2",
            cell.column.columnDef.meta?.center && "justify-center",
          )}
          style={
            cell.column.columnDef.meta?.flex
              ? { flex: 1, minWidth: 0 }
              : { width: cell.column.getSize() }
          }
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

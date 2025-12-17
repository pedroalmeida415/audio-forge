"use client";

import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Play,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { formatDuration, formatTimestamp } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import type { SegmentWithId } from "../../_store/clipping-workspace-store";
import {
  DURATION_THRESHOLDS,
  getSegmentDuration,
} from "../../_utils/segment-utils";

// Extended segment with computed fields for the table
export interface TableSegment extends SegmentWithId {
  index: number;
  colorIndex: number;
}

// Table meta type for passing stable callbacks
export interface TableMeta {
  onPlay: (segmentId: string) => void;
  onChangeSpeaker: (segmentId: string) => void;
  onDelete: (segmentId: string) => void;
}

// Get sort icon based on column state
function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ArrowUp className="ml-1 h-3 w-3" />;
  if (isSorted === "desc") return <ArrowDown className="ml-1 h-3 w-3" />;
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
}

// ============================================================================
// Cell Components
// ============================================================================

// Header checkbox for select all
function SelectAllCheckbox({
  table,
}: {
  table: Table<TableSegment>;
}) {
  const checked =
    table.getIsAllPageRowsSelected() ||
    (table.getIsSomePageRowsSelected() && "indeterminate");

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="Select all"
      className="translate-y-[2px]"
    />
  );
}

// Row checkbox cell
function SelectCell({
  row,
  isSelected,
}: {
  row: Row<TableSegment>;
  isSelected: boolean;
}) {
  return (
    <Checkbox
      checked={isSelected}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select row"
      className="translate-y-[2px]"
    />
  );
}

// Index cell
function IndexCell({ index }: { index: number }) {
  return (
    <span className="block text-center font-mono text-muted-foreground text-xs">
      {String(index + 1).padStart(3, "0")}
    </span>
  );
}

// Play button cell
function PlayCell({
  segmentId,
  onPlay,
}: {
  segmentId: string;
  onPlay: (id: string) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={(e) => {
        e.stopPropagation();
        onPlay(segmentId);
      }}
    >
      <Play className="h-3.5 w-3.5" />
    </Button>
  );
}

// Duration cell with color coding
function DurationCell({
  duration,
}: {
  duration: number;
}) {
  const variant =
    duration > DURATION_THRESHOLDS.TOO_LONG
      ? "warning"
      : duration < DURATION_THRESHOLDS.TOO_SHORT
        ? "danger"
        : "normal";

  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 font-mono text-xs",
        variant === "normal" && "bg-muted text-muted-foreground",
        variant === "warning" && "bg-amber-500/20 text-amber-500",
        variant === "danger" && "bg-red-500/20 text-red-500",
      )}
    >
      {formatDuration(duration)}
    </span>
  );
}

// Reviewed status cell
function ReviewedCell({
  isReviewed,
}: {
  isReviewed: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          isReviewed ? "bg-green-500" : "bg-muted-foreground/30",
        )}
      />
      <span className="text-muted-foreground text-xs">
        {isReviewed ? "Yes" : "No"}
      </span>
    </div>
  );
}

// Actions cell with tooltips
function ActionsCell({
  segmentId,
  onChangeSpeaker,
  onDelete,
}: {
  segmentId: string;
  onChangeSpeaker: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onChangeSpeaker(segmentId);
            }}
          >
            <User className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Change speaker</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-red-500/20 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(segmentId);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete segment</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ============================================================================
// Column Definitions
// ============================================================================

export function createColumns(options: {
  onPlay: (segmentId: string) => void;
  onChangeSpeaker: (segmentId: string) => void;
  onDelete: (segmentId: string) => void;
}): ColumnDef<TableSegment>[] {
  return [
    // Checkbox column
    {
      id: "select",
      header: ({ table }) => <SelectAllCheckbox table={table} />,
      cell: ({ row }) => (
        <SelectCell row={row} isSelected={row.getIsSelected()} />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    // Index column
    {
      id: "index",
      accessorFn: (row) => row.index,
      header: () => <span className="block text-center">#</span>,
      cell: ({ row }) => <IndexCell index={row.original.index} />,
      size: 50,
    },

    // Play button column
    {
      id: "play",
      header: "",
      cell: ({ row }) => (
        <PlayCell segmentId={row.original.id} onPlay={options.onPlay} />
      ),
      enableSorting: false,
      size: 40,
    },

    // Transcription column (flexible width)
    {
      id: "transcription",
      accessorFn: () => "",
      header: "Transcription",
      cell: () => (
        <span className="text-muted-foreground text-sm italic">
          No transcription
        </span>
      ),
    },

    // Start time column
    {
      id: "start",
      accessorFn: (row) => row.start,
      header: "Start",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {formatTimestamp(row.original.start)}
        </span>
      ),
      size: 70,
    },

    // End time column
    {
      id: "end",
      accessorFn: (row) => row.end,
      header: "End",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {formatTimestamp(row.original.end)}
        </span>
      ),
      size: 70,
    },

    // Duration column (sortable, color-coded)
    {
      id: "duration",
      accessorFn: (row) => getSegmentDuration(row),
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Duration
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <DurationCell duration={getSegmentDuration(row.original)} />
      ),
      size: 90,
    },

    // Reviewed column (sortable)
    {
      id: "reviewed",
      accessorFn: (row) => row.isReviewed ?? false,
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Reviewed
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <ReviewedCell isReviewed={row.original.isReviewed ?? false} />
      ),
      size: 90,
    },

    // Actions column (shows on hover)
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <ActionsCell
          segmentId={row.original.id}
          onChangeSpeaker={options.onChangeSpeaker}
          onDelete={options.onDelete}
        />
      ),
      size: 80,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

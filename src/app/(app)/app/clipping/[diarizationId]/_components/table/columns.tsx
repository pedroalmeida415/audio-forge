"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Play, Trash2, User } from "lucide-react";
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
  ALERT_THRESHOLDS,
  getSegmentDuration,
} from "../../_utils/segment-utils";

// Extended segment with computed fields for the table
export interface TableSegment extends SegmentWithId {
  index: number;
  colorIndex: number;
}

// Get sort icon based on column state
function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ArrowUp className="ml-1 h-3 w-3" />;
  if (isSorted === "desc") return <ArrowDown className="ml-1 h-3 w-3" />;
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
}

export function createColumns(options: {
  onPlay: (segmentId: string) => void;
  onChangeSpeaker: (segmentId: string) => void;
  onDelete: (segmentId: string) => void;
}): ColumnDef<TableSegment>[] {
  return [
    // Checkbox column
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    // Play button column
    {
      id: "play",
      header: "",
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                options.onPlay(row.original.id);
              }}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Play segment</TooltipContent>
        </Tooltip>
      ),
      enableSorting: false,
      size: 40,
    },

    // Index column
    {
      id: "index",
      accessorFn: (row) => row.index,
      header: "#",
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground text-xs">
          {String(row.original.index + 1).padStart(3, "0")}
        </span>
      ),
      size: 50,
    },

    // Transcription column (flexible width)
    {
      id: "transcription",
      accessorFn: () => "",
      header: "Transcription",
      cell: () => (
        <span className="text-muted-foreground italic">No transcription</span>
      ),
      // No size - will expand to fill available space
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
      cell: ({ row }) => {
        const duration = getSegmentDuration(row.original);
        const variant =
          duration > ALERT_THRESHOLDS.TOO_LONG
            ? "warning"
            : duration < ALERT_THRESHOLDS.TOO_SHORT
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
      },
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
      cell: ({ row }) => {
        const isReviewed = row.original.isReviewed ?? false;
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
      },
      size: 90,
    },

    // Actions column (shows on hover)
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
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
                    options.onChangeSpeaker(row.original.id);
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
                    options.onDelete(row.original.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete segment</TooltipContent>
            </Tooltip>
          </div>
        );
      },
      size: 80,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

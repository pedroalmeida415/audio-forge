"use client";

import { useValue } from "@legendapp/state/react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { formatDuration } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import type { FileSegment } from "~/server/db/schema";
import { useClippingStore } from "../../_context/store.context";
import {
  DURATION_THRESHOLDS,
  getSegmentDuration,
} from "../../_utils/segment-utils";
import { EditableTimeCell } from "./editable-time-cell";

// Get sort icon based on column state
function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ArrowUp className="ml-1 h-3 w-3" />;
  if (isSorted === "desc") return <ArrowDown className="ml-1 h-3 w-3" />;
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
}

// ============================================================================
// Cell Components
// ============================================================================

// Header checkbox for select all - subscribes directly to store
function SelectAllCheckbox() {
  const $store = useClippingStore();

  const speakerSegments = useValue(
    () =>
      $store.segmentsBySpeaker
        .get()
        [$store.selectedSpeakerId.get()!]?.filter((seg) => !seg.isDeleted) ?? [],
  );
  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const isAllSelected =
    speakerSegments.length > 0 &&
    speakerSegments.every((segment) => selectedSegmentIds.has(segment.id));

  const handleToggleAll = (selectAll: boolean) => {
    if (selectAll) {
      $store.selectAllSegments();
    } else {
      $store.clearAllSelected();
    }
  };

  return (
    <Checkbox
      checked={isAllSelected}
      onCheckedChange={(value) => handleToggleAll(!!value)}
      aria-label="Select all"
      className="translate-y-[2px]"
    />
  );
}

// Row checkbox cell - subscribes directly to store
function SelectCell({ segmentId }: { segmentId: string }) {
  const $store = useClippingStore();
  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(segmentId),
  );

  return (
    <Checkbox
      checked={isSelected}
      onCheckedChange={() => $store.toggleSelectSegment(segmentId)}
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

// Play button cell - subscribes directly to store
function PlayCell({ segmentId }: { segmentId: string }) {
  const $store = useClippingStore();
  const { handleSegmentPlay } = $store.playback.peek();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={(e) => {
        e.stopPropagation();
        handleSegmentPlay(segmentId);
      }}
    >
      <Play className="h-3.5 w-3.5" />
    </Button>
  );
}

// Duration cell with color coding
function DurationCell({ duration }: { duration: number }) {
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
function ReviewedCell({ isReviewed }: { isReviewed: boolean }) {
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

// ============================================================================
// Column Definitions
// ============================================================================

export function createColumns(): ColumnDef<FileSegment>[] {
  return [
    // Checkbox column - subscribes directly to store
    {
      id: "select",
      header: () => <SelectAllCheckbox />,
      cell: ({ row }) => <SelectCell segmentId={row.original.id} />,
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    // Index column - uses row index from table
    {
      id: "index",
      header: () => <span className="block text-center">#</span>,
      cell: ({ row }) => <IndexCell index={row.index} />,
      size: 50,
    },

    // Play button column - subscribes directly to playback context
    {
      id: "play",
      header: "",
      cell: ({ row }) => <PlayCell segmentId={row.original.id} />,
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

    // Start time column (editable)
    {
      id: "start",
      accessorFn: (row) => row.start,
      header: "Start",
      cell: ({ row }) => (
        <EditableTimeCell
          value={row.original.start}
          segmentId={row.original.id}
          field="start"
          minValue={0}
          maxValue={row.original.end - 0.1}
        />
      ),
      size: 70,
    },

    // End time column (editable)
    {
      id: "end",
      accessorFn: (row) => row.end,
      header: "End",
      cell: ({ row }) => (
        <EditableTimeCell
          value={row.original.end}
          segmentId={row.original.id}
          field="end"
          minValue={row.original.start + 0.1}
        />
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
  ];
}

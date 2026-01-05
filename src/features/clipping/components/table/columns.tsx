"use client";

import { useValue } from "@legendapp/state/react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useClippingStore } from "~/features/clipping/context/store.context";
import type { SegmentWithSpeaker } from "~/features/clipping/store/clipping-store";
import {
  DURATION_THRESHOLDS,
  getSegmentDuration,
} from "~/features/clipping/utils/segment-utils";
import { formatDuration } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
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
    () => $store.segmentsBySpeaker.get()[$store.selectedSpeakerId.get()!] ?? [],
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

// ============================================================================
// Column Definitions
// ============================================================================

export function createColumns(): ColumnDef<SegmentWithSpeaker>[] {
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
      id: "startTime",
      accessorFn: (row) => row.startTime,
      header: "Start",
      cell: ({ row }) => (
        <EditableTimeCell
          value={row.original.startTime}
          segmentId={row.original.id}
          field="startTime"
          minValue={0}
          maxValue={row.original.endTime - 0.1}
        />
      ),
      size: 95,
    },

    // End time column (editable)
    {
      id: "endTime",
      accessorFn: (row) => row.endTime,
      header: "End",
      cell: ({ row }) => (
        <EditableTimeCell
          value={row.original.endTime}
          segmentId={row.original.id}
          field="endTime"
          minValue={row.original.startTime + 0.1}
        />
      ),
      size: 95,
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

    // Index column - uses row index from table
    {
      id: "index",
      header: () => <span className="block text-center">#</span>,
      cell: ({ row }) => <IndexCell index={row.index} />,
      size: 50,
    },
  ];
}

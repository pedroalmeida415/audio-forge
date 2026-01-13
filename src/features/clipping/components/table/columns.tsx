"use client";

import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { DURATION_THRESHOLDS } from "~/features/clipping/utils/segment-utils";
import { formatDuration } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import type { Segment } from "~/server/db/schema";
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

  // Compute isAllSelected reactively - subscribes to both segments and selection
  const isAllSelected = useValue(() => {
    const speakerId = $store.selectedSpeakerId.get();
    if (!speakerId) return false;

    const speakerSegments = $store.segmentsBySpeaker.get().get(speakerId) ?? [];
    if (speakerSegments.length === 0) return false;

    // Access the Set reactively via .get() to ensure we recompute on changes
    const selectedIds = $store.selectedSegmentIds.get();
    return speakerSegments.every(($segment) =>
      selectedIds.has($segment.id.peek()),
    );
  });

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

// Start time cell - subscribes to observable segment
function StartTimeCell({ $segment }: { $segment: Observable<Segment> }) {
  const startTime = useValue($segment.startTime);
  const endTime = useValue($segment.endTime);
  const segmentId = $segment.id.peek();

  return (
    <EditableTimeCell
      value={startTime}
      segmentId={segmentId}
      field="startTime"
      minValue={0}
      maxValue={endTime - 0.1}
    />
  );
}

// End time cell - subscribes to observable segment
function EndTimeCell({ $segment }: { $segment: Observable<Segment> }) {
  const startTime = useValue($segment.startTime);
  const endTime = useValue($segment.endTime);
  const segmentId = $segment.id.peek();

  return (
    <EditableTimeCell
      value={endTime}
      segmentId={segmentId}
      field="endTime"
      minValue={startTime + 0.1}
    />
  );
}

// Duration cell with color coding - subscribes to observable segment
function DurationCell({ $segment }: { $segment: Observable<Segment> }) {
  const startTime = useValue($segment.startTime);
  const endTime = useValue($segment.endTime);
  const duration = endTime - startTime;

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

export function createColumns(): ColumnDef<Observable<Segment>>[] {
  return [
    // Checkbox column - subscribes directly to store
    {
      id: "select",
      header: () => <SelectAllCheckbox />,
      cell: ({ row }) => <SelectCell segmentId={row.original.id.peek()} />,
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    // Play button column - subscribes directly to playback context
    {
      id: "play",
      header: "",
      cell: ({ row }) => <PlayCell segmentId={row.original.id.peek()} />,
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

    // Start time column (editable) - subscribes to observable
    {
      id: "startTime",
      accessorFn: ($segment) => $segment.startTime.peek(),
      header: "Start",
      cell: ({ row }) => <StartTimeCell $segment={row.original} />,
      size: 95,
    },

    // End time column (editable) - subscribes to observable
    {
      id: "endTime",
      accessorFn: ($segment) => $segment.endTime.peek(),
      header: "End",
      cell: ({ row }) => <EndTimeCell $segment={row.original} />,
      size: 95,
    },

    // Duration column (sortable, color-coded)
    {
      id: "duration",
      accessorFn: ($segment) =>
        $segment.endTime.peek() - $segment.startTime.peek(),
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
      cell: ({ row }) => <DurationCell $segment={row.original} />,
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

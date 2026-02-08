"use client";

import { useValue } from "@legendapp/state/react";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import { cn } from "~/lib/utils";
import { CompactAudioCell, PlaceholderAudioCell } from "./compact-audio-cell";

// ============================================================================
// Cell Components (exported for direct rendering in TableRow)
// ============================================================================

// Header checkbox for select all
export function SelectAllCheckbox() {
  const $store = useSpeakerPageStore();

  const isAllSelected = useValue(() => {
    const segmentIds = Array.from($store.segments.keys());
    if (segmentIds.length === 0) return false;

    const selectedIds = $store.selectedSegmentIds.get();
    return segmentIds.every((id) => selectedIds.has(id));
  });

  const handleToggleAll = (selectAll: boolean) => {
    if (selectAll) {
      $store.selectAll();
    } else {
      $store.clearSelection();
    }
  };

  return (
    <div className="flex justify-center">
      <Checkbox
        checked={isAllSelected}
        onCheckedChange={(value) => handleToggleAll(!!value)}
        aria-label="Select all"
      />
    </div>
  );
}

// Row checkbox cell
export function SelectCell({ segmentId }: { segmentId: string }) {
  const $store = useSpeakerPageStore();
  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(segmentId),
  );

  return (
    <div className="flex justify-center">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => $store.toggleSelection(segmentId)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    </div>
  );
}

// Original segment audio cell
export function OriginalAudioCell({
  storageKey,
  startTime,
  endTime,
}: {
  storageKey: string;
  startTime: number;
  endTime: number;
}) {
  const duration = endTime - startTime;

  const { sourceState, sourceUrl, loadSource } = useSegmentAudio({
    sessionFileStorageKey: storageKey,
    startTime,
    endTime,
    clipStorageKey: null,
  });

  return (
    <CompactAudioCell
      audioState={sourceState}
      audioUrl={sourceUrl}
      onLoadAudio={loadSource}
      duration={duration}
      variant="original"
    />
  );
}

// Processed clip audio cell
export function ProcessedAudioCell({
  segmentId,
  clipStorageKey,
  clipDuration,
  fallbackDuration,
}: {
  segmentId: string;
  clipStorageKey: string | null;
  clipDuration: number | null;
  fallbackDuration: number;
}) {
  const $store = useSpeakerPageStore();
  const isClipPending = useValue(() =>
    $store.clipPendingIds.get().has(segmentId),
  );

  const { clipState, clipUrl, loadClip } = useSegmentAudio({
    sessionFileStorageKey: "",
    startTime: 0,
    endTime: 0,
    clipStorageKey,
  });

  const duration = clipDuration ?? fallbackDuration;

  if (!clipStorageKey) {
    return <PlaceholderAudioCell isPending={isClipPending} />;
  }

  return (
    <CompactAudioCell
      audioState={clipState}
      audioUrl={clipUrl}
      onLoadAudio={loadClip}
      duration={duration}
      variant="processed"
    />
  );
}

// Score cell - shows clip quality score
export function ScoreCell({ score }: { score: number | null }) {
  const scoreColor =
    score === null
      ? "text-muted-foreground/50"
      : score >= 4
        ? "text-success"
        : score >= 3
          ? "text-warning"
          : "text-destructive";

  return (
    <div className="flex justify-center">
      <span
        className={cn(
          "font-bold text-2xl tabular-nums tracking-tighter",
          scoreColor,
        )}
      >
        {score !== null ? score.toFixed(1) : "--"}
      </span>
    </div>
  );
}

// Duration badge cell
export function DurationCell({ duration }: { duration: number }) {
  return (
    <div className="flex justify-center">
      <Badge variant="secondary" className="font-mono text-xs">
        {duration.toFixed(1)}s
      </Badge>
    </div>
  );
}

// Index cell
export function IndexCell({ index }: { index: number }) {
  return (
    <span className="font-mono text-muted-foreground text-xs">
      #{String(index + 1).padStart(4, "0")}
    </span>
  );
}

// Actions cell - visible on row hover
export function ActionsCell({ segmentId }: { segmentId: string }) {
  const handleEdit = () => {
    // TODO: Implement segment editing
    console.log("Edit segment:", segmentId);
  };

  return (
    <div className="flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={handleEdit}
        aria-label="Edit segment"
      >
        <PencilIcon className="size-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// Column Definitions (headers only - cells are manually rendered in TableRow)
// ============================================================================

export function createColumns(): ColumnDef<string>[] {
  return [
    {
      id: "select",
      header: () => <SelectAllCheckbox />,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "index",
      header: "#",
    },
    {
      id: "segment",
      header: "Seg.",
    },
    {
      id: "clip",
      header: "Clip",
    },
    {
      id: "score",
      header: () => <span className="w-full text-center">Score</span>,
    },
    {
      id: "duration",
      header: () => <span className="w-full text-center">Duration</span>,
    },
    {
      id: "transcription",
      header: "Transcription",
    },
    {
      id: "tags",
      header: "Tags",
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

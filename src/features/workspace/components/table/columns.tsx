"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";
import { useSnapshot } from "valtio";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  CompactAudioCell,
  PlaceholderAudioCell,
} from "~/features/speaker/components/table/compact-audio-cell";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { cn } from "~/lib/utils";

// ============================================================================
// Cell Components
// ============================================================================

export function SelectAllCheckbox() {
  const $store = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot($store);

  const checked: boolean | "indeterminate" =
    isAllSelected && excludedSegmentIds.size === 0
      ? true
      : isAllSelected || selectedSegmentIds.size > 0
        ? "indeterminate"
        : false;

  return (
    <div className="flex justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          if (value) {
            $store.selectAll();
          } else {
            $store.clearSelection();
          }
        }}
        aria-label="Select all"
      />
    </div>
  );
}

export function SelectCell({ segmentId }: { segmentId: string }) {
  const $store = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot($store);

  const isSelected = isAllSelected
    ? !excludedSegmentIds.has(segmentId)
    : selectedSegmentIds.has(segmentId);

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

export function ProcessedAudioCell({
  clipStorageKey,
  clipDuration,
  fallbackDuration,
}: {
  clipStorageKey: string | null;
  clipDuration: number | null;
  fallbackDuration: number;
}) {
  const { clipState, clipUrl, loadClip } = useSegmentAudio({
    sessionFileStorageKey: "",
    startTime: 0,
    endTime: 0,
    clipStorageKey,
  });

  const duration = clipDuration ?? fallbackDuration;

  if (!clipStorageKey) {
    return <PlaceholderAudioCell />;
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
    <span
      className={cn(
        "font-bold text-2xl tabular-nums tracking-tighter",
        scoreColor,
      )}
    >
      {score !== null ? score.toFixed(1) : "--"}
    </span>
  );
}

export function DurationCell({ duration }: { duration: number }) {
  return (
    <div className="flex justify-center">
      <Badge variant="secondary" className="font-mono text-xs">
        {duration.toFixed(1)}s
      </Badge>
    </div>
  );
}

export function IndexCell({ index }: { index: number }) {
  return (
    <span className="font-mono text-muted-foreground text-xs">
      #{String(index + 1).padStart(4, "0")}
    </span>
  );
}

export function ActionsCell({ segmentId }: { segmentId: string }) {
  const handleEdit = () => {
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

export function TranscriptionCell({
  transcription,
}: {
  transcription: string | null;
}) {
  if (!transcription) {
    return (
      <span className="text-muted-foreground text-sm italic">
        No transcription
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="line-clamp-1 cursor-default text-sm">
          {transcription}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md">
        <p className="whitespace-pre-wrap">{transcription}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Column Definitions
// ============================================================================

export const GRID_COLUMNS = "40px 60px 48px 48px 60px 80px 1fr 200px 48px";

export function createColumns(): ColumnDef<SegmentWithClip>[] {
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

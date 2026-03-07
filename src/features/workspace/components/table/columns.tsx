"use client";

import type { ColumnDef, RowData, Table } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
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
} from "~/features/workspace/components/table/compact-audio-cell";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { useSegmentAudio } from "~/features/workspace/hooks/use-segment-audio";
import { workspaceParams } from "~/features/workspace/search-params";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { cn } from "~/lib/utils";
import { TagsCell } from "./tags-cell";

// ============================================================================
// Column Meta Augmentation
// ============================================================================

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: required for module augmentation
  interface ColumnMeta<TData extends RowData, TValue> {
    flex?: boolean;
    center?: boolean;
  }
}

// ============================================================================
// Cell Components
// ============================================================================

function SelectAllCheckbox({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const { store } = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot(store);

  const activeFilters = table.getState().columnFilters.length > 0;

  let checked: boolean | "indeterminate" = false;

  if (!activeFilters) {
    checked =
      isAllSelected && excludedSegmentIds.size === 0
        ? true
        : isAllSelected || selectedSegmentIds.size > 0
          ? "indeterminate"
          : false;
  } else {
    const filteredRows = table.getFilteredRowModel().rows;
    const filteredCount = filteredRows.length;

    if (filteredCount === 0) {
      checked = false;
    } else if (isAllSelected && excludedSegmentIds.size === 0) {
      checked = true;
    } else if (!isAllSelected && selectedSegmentIds.size === 0) {
      checked = false;
    } else {
      let selectedCount = 0;
      for (let i = 0; i < filteredCount; i++) {
        const row = filteredRows[i];
        if (!row) continue;
        const id = row.original.id;
        if (
          isAllSelected
            ? !excludedSegmentIds.has(id)
            : selectedSegmentIds.has(id)
        ) {
          selectedCount++;
        }
      }

      checked =
        selectedCount === filteredCount
          ? true
          : selectedCount > 0
            ? "indeterminate"
            : false;
    }
  }

  const handleCheckedChange = (value: boolean | "indeterminate") => {
    if (activeFilters) {
      const filteredIds = table
        .getFilteredRowModel()
        .rows.map((r) => r.original.id);
      if (value) {
        store.selectMultiple(filteredIds);
      } else {
        store.deselectMultiple(filteredIds);
      }
    } else {
      if (value) {
        store.selectAll();
      } else {
        store.clearSelection();
      }
    }
  };

  return (
    <div className="flex justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={handleCheckedChange}
        aria-label={activeFilters ? "Select all filtered" : "Select all"}
      />
    </div>
  );
}

function SelectCell({ segmentId }: { segmentId: string }) {
  const { store } = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot(store);

  const isSelected = isAllSelected
    ? !excludedSegmentIds.has(segmentId)
    : selectedSegmentIds.has(segmentId);

  return (
    <div className="flex justify-center">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => store.toggleSelection(segmentId)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    </div>
  );
}

function OriginalAudioCell({
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

function ProcessedAudioCell({
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

function ScoreCell({ score }: { score: number | null }) {
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

function DurationCell({ duration }: { duration: number }) {
  return (
    <div className="flex justify-center">
      <Badge variant="secondary" className="font-mono text-xs">
        {duration.toFixed(1)}s
      </Badge>
    </div>
  );
}

function IndexCell({ index }: { index: number }) {
  return (
    <span className="font-mono text-muted-foreground text-xs">
      #{String(index + 1).padStart(4, "0")}
    </span>
  );
}

function ActionsCell({
  segmentId,
  sourceId,
}: {
  segmentId: string;
  sourceId: string;
}) {
  const [, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });

  const handleEdit = () => {
    void setQueryState({ sourceId, activeSegmentId: segmentId });
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

function TranscriptionCell({
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

export function createColumns(): ColumnDef<SegmentWithClip>[] {
  return [
    {
      id: "select",
      header: ({ table }) => <SelectAllCheckbox table={table} />,
      cell: ({ row }) => <SelectCell segmentId={row.original.id} />,
      size: 40,
      enableSorting: false,
      enableHiding: false,
      meta: {
        center: true,
      },
    },
    {
      id: "index",
      header: "#",
      cell: ({ row }) => <IndexCell index={row.index} />,
      size: 60,
    },
    {
      id: "segment",
      header: "Segment",
      cell: ({ row }) => (
        <OriginalAudioCell
          storageKey={row.original.source.storageKey ?? ""}
          startTime={row.original.startTime}
          endTime={row.original.endTime}
        />
      ),
      size: 76,

      meta: {
        center: true,
      },
    },
    {
      id: "clip",
      accessorFn: (row) => !!row.clip,
      header: "Clip",
      filterFn: "equals",
      cell: ({ row }) => {
        const segment = row.original;
        const duration = segment.endTime - segment.startTime;
        return (
          <ProcessedAudioCell
            clipStorageKey={segment.clip?.storageKey ?? null}
            clipDuration={segment.clip?.duration ?? null}
            fallbackDuration={duration}
          />
        );
      },
      size: 48,
      enableSorting: false,

      meta: {
        center: true,
      },
    },
    {
      id: "score",
      accessorFn: (row) => row.clip?.scores?.DNSMOS?.P808_MOS ?? null,
      header: "Score",
      filterFn: (
        row,
        columnId,
        filterValue: [number | undefined, number | undefined],
      ) => {
        const value = row.getValue<number | null>(columnId);
        if (value === null) return false;
        const [min, max] = filterValue;
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
      },
      cell: ({ row }) => (
        <ScoreCell
          score={row.original.clip?.scores?.DNSMOS?.P808_MOS ?? null}
        />
      ),
      size: 74,
      meta: {
        center: true,
      },
    },
    {
      id: "duration",
      accessorFn: (row) => row.endTime - row.startTime,
      header: "Duration",
      filterFn: "inNumberRange",
      cell: ({ row }) => {
        const duration = row.original.endTime - row.original.startTime;
        return <DurationCell duration={duration} />;
      },
      size: 96,
      meta: {
        center: true,
      },
    },
    {
      id: "transcription",
      header: "Transcription",
      accessorFn: (row) => row.transcription,
      filterFn: (row, columnId, filterValue: boolean) => {
        if (filterValue === undefined) return true;
        const hasTrans = !!row.getValue(columnId);
        return filterValue ? hasTrans : !hasTrans;
      },
      cell: ({ row }) => (
        <TranscriptionCell transcription={row.original.transcription} />
      ),
      meta: { flex: true },
      enableSorting: false,
    },
    {
      id: "tags",
      header: "Tags",
      accessorFn: (row) => row.tags,
      filterFn: (row, columnId, filterValue: string) => {
        if (!filterValue) return true;
        const tags = row.getValue<string[] | null>(columnId);
        if (!tags || tags.length === 0) return false;
        const lowerQuery = filterValue.toLowerCase();
        return tags.some((t) => t.toLowerCase().includes(lowerQuery));
      },
      cell: ({ row }) => (
        <TagsCell tags={row.original.tags} segmentId={row.original.id} />
      ),
      enableSorting: false,
      size: 200,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <ActionsCell
          segmentId={row.original.id}
          sourceId={row.original.sourceId}
        />
      ),
      size: 48,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

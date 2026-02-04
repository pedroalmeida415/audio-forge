"use client";

import { useValue } from "@legendapp/state/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";
import { CompactAudioCell, PlaceholderAudioCell } from "./compact-audio-cell";
import { TagsCell } from "./tags-cell";
import { TranscriptionCell } from "./transcription-cell";

// ============================================================================
// Cell Components
// ============================================================================

// Header checkbox for select all
function SelectAllCheckbox() {
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
function SelectCell({ segmentId }: { segmentId: string }) {
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
function OriginalAudioCell({ segment }: { segment: SegmentWithClip }) {
  const storageKey = segment.session.file.storageKey ?? "";
  const duration = segment.endTime - segment.startTime;

  const { sourceState, sourceUrl, loadSource } = useSegmentAudio({
    sessionFileStorageKey: storageKey,
    startTime: segment.startTime,
    endTime: segment.endTime,
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
function ProcessedAudioCell({ segment }: { segment: SegmentWithClip }) {
  const $store = useSpeakerPageStore();
  const isClipPending = useValue(() =>
    $store.clipPendingIds.get().has(segment.id),
  );

  const hasClip = !!segment.clip?.file.storageKey;

  const { clipState, clipUrl, loadClip } = useSegmentAudio({
    sessionFileStorageKey: "",
    startTime: 0,
    endTime: 0,
    clipStorageKey: segment.clip?.file.storageKey ?? null,
  });

  const duration =
    segment.clip?.file.duration ?? segment.endTime - segment.startTime;

  if (!hasClip) {
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
function ScoreCell({ segment }: { segment: SegmentWithClip }) {
  const score = segment.clip?.scores?.DNSMOS?.P808_MOS ?? null;

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
function DurationCell({ segment }: { segment: SegmentWithClip }) {
  const duration = segment.endTime - segment.startTime;
  return (
    <div className="flex justify-center">
      <Badge variant="secondary" className="font-mono text-xs">
        {duration.toFixed(1)}s
      </Badge>
    </div>
  );
}

// Index cell
function IndexCell({ index }: { index: number }) {
  return (
    <span className="font-mono text-muted-foreground text-xs">
      #{String(index + 1).padStart(4, "0")}
    </span>
  );
}

// ============================================================================
// Column Definitions
// ============================================================================

export function createColumns(): ColumnDef<SegmentWithClip>[] {
  return [
    // Checkbox column
    {
      id: "select",
      header: () => <SelectAllCheckbox />,
      cell: ({ row }) => <SelectCell segmentId={row.original.id} />,
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    // Index
    {
      id: "index",
      header: "#",
      cell: ({ row }) => <IndexCell index={row.index} />,
      size: 60,
    },

    // Original Segment audio cell
    {
      id: "original",
      header: "Original Segment",
      cell: ({ row }) => <OriginalAudioCell segment={row.original} />,
      size: 180,
    },

    // Processed Clip audio cell
    {
      id: "processed",
      header: "Processed Clip",
      cell: ({ row }) => <ProcessedAudioCell segment={row.original} />,
      size: 180,
    },

    // Score (clip quality)
    {
      id: "score",
      header: () => <span className="w-full text-center">Score</span>,
      cell: ({ row }) => <ScoreCell segment={row.original} />,
      size: 60,
    },

    // Duration badge
    {
      id: "duration",
      header: () => <span className="w-full text-center">Duration</span>,
      cell: ({ row }) => <DurationCell segment={row.original} />,
      size: 80,
    },

    // Transcription (truncated with ellipsis)
    {
      id: "transcription",
      header: "Transcription",
      cell: ({ row }) => (
        <TranscriptionCell transcription={row.original.transcription} />
      ),
      size: 400,
    },

    // Tags (only column that expands)
    {
      id: "tags",
      header: "Tags",
      cell: ({ row }) => <TagsCell tags={row.original.tags} />,
      // No size - this column expands to fill available space
    },
  ];
}

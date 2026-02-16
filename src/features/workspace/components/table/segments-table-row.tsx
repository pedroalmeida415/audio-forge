import type { Row } from "@tanstack/react-table";
import { Skeleton } from "~/components/ui/skeleton";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import {
  ActionsCell,
  DurationCell,
  GRID_COLUMNS,
  IndexCell,
  OriginalAudioCell,
  ProcessedAudioCell,
  ScoreCell,
  SelectCell,
  TranscriptionCell,
} from "./columns";
import { TagsCell } from "./tags-cell";

interface TableRowProps {
  row: Row<SegmentWithClip>;
}

export function SegmentsTableRow({ row }: TableRowProps) {
  const segment = row.original;
  const duration = segment.endTime - segment.startTime;

  return (
    <div
      role="row"
      className="group/row grid items-center border-border/50 border-b transition-colors hover:bg-muted/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:hover:bg-primary/5"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
      data-segment-id={row.id}
    >
      <div role="cell" className="px-2 py-2">
        <SelectCell segmentId={segment.id} />
      </div>
      <div role="cell" className="px-2 py-2">
        <IndexCell index={row.index} />
      </div>
      <div role="cell" className="px-2 py-2">
        <OriginalAudioCell
          storageKey={segment.source.storageKey ?? ""}
          startTime={segment.startTime}
          endTime={segment.endTime}
        />
      </div>
      <div role="cell" className="px-2 py-2">
        <ProcessedAudioCell
          clipStorageKey={segment.clip?.storageKey ?? null}
          clipDuration={segment.clip?.duration ?? null}
          fallbackDuration={duration}
        />
      </div>
      <div role="cell" className="px-2 py-2">
        <ScoreCell score={segment.clip?.scores?.DNSMOS?.P808_MOS ?? null} />
      </div>
      <div role="cell" className="px-2 py-2">
        <DurationCell duration={duration} />
      </div>
      <div role="cell" className="px-2 py-2">
        <TranscriptionCell transcription={segment.transcription} />
      </div>
      <div role="cell" className="px-2 py-2">
        <TagsCell tags={segment.tags} segmentId={segment.id} />
      </div>
      <div role="cell" className="px-2 py-2">
        <ActionsCell segmentId={segment.id} />
      </div>
    </div>
  );
}

export function SegmentsTableRowSkeleton() {
  return (
    <div
      role="row"
      className="grid items-center border-border/50 border-b"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      <div className="px-2 py-2">
        <Skeleton className="size-4 rounded" />
      </div>
      <div className="px-2 py-2">
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
        </div>
      </div>
      <div className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
        </div>
      </div>
      <div className="flex justify-center px-2 py-2">
        <Skeleton className="h-7 w-10" />
      </div>
      <div className="flex justify-center px-2 py-2">
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
      <div className="px-2 py-2">
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="px-2 py-2">
        <div className="flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="px-2 py-2" />
    </div>
  );
}

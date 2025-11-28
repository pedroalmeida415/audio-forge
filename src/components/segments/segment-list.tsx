"use client";

import { RotateCcw, X } from "lucide-react";
import { CollectionCombobox } from "~/components/clipping/collection-combobox";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useSegmentActions } from "~/hooks/use-segment-actions";
import { cn } from "~/lib/utils";

type Segment = {
  id: string;
  pyannoteSpeakerLabel: string;
  originalStartTime: number;
  originalEndTime: number;
  editedStartTime: number;
  editedEndTime: number;
  status: string;
  collectionId: string | null;
  collection: {
    id: string;
    name: string;
    project?: { id: string; name: string };
  } | null;
};

type SegmentListProps = {
  segments: Segment[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  jobId: string;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

function SegmentItem({
  segment,
  isSelected,
  onClick,
  jobId,
}: {
  segment: Segment;
  isSelected: boolean;
  onClick: () => void;
  jobId: string;
}) {
  const {
    assignToCollection,
    toggleExcluded,
    resetTimestamps: resetTimestampsAction,
    createAndAssign,
    isPending,
  } = useSegmentActions({ jobId });

  function handleCollectionSelect(collectionId: string | null) {
    assignToCollection(segment.id, collectionId);
  }

  function handleCreateAndAssign(name: string, projectId: string) {
    createAndAssign(segment.id, name, projectId);
  }

  const isExcluded = segment.status === "excluded";
  const hasTimestampChanges =
    segment.editedStartTime !== segment.originalStartTime ||
    segment.editedEndTime !== segment.originalEndTime;

  // Build selectedCollection with project info for the combobox
  const selectedCollection = segment.collection
    ? {
        id: segment.collection.id,
        name: segment.collection.name,
        project: segment.collection.project ?? { id: "", name: "Unknown" },
      }
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isSelected && "border-primary bg-primary/5",
        isExcluded && "opacity-50",
        !(isSelected || isExcluded) && "hover:border-muted-foreground/50"
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <Badge className="mb-1" variant="outline">
            {segment.pyannoteSpeakerLabel}
          </Badge>
          <p className="text-muted-foreground text-xs">
            {formatTime(segment.editedStartTime)} -{" "}
            {formatTime(segment.editedEndTime)}
            {hasTimestampChanges && (
              <span className="ml-1 text-yellow-600">(edited)</span>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {hasTimestampChanges && (
            <Button
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                resetTimestampsAction(segment.id);
              }}
              size="icon"
              title="Reset to original timestamps"
              variant="ghost"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          <Button
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              toggleExcluded(segment.id, isExcluded);
            }}
            size="icon"
            title={isExcluded ? "Include segment" : "Exclude segment"}
            variant="ghost"
          >
            <X className={cn("h-3 w-3", isExcluded && "text-red-500")} />
          </Button>
        </div>
      </div>

      {!isExcluded && (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <CollectionCombobox
            disabled={isPending}
            onCreateAndAssign={handleCreateAndAssign}
            onSelect={handleCollectionSelect}
            selectedCollection={selectedCollection}
          />
        </div>
      )}
    </div>
  );
}

export function SegmentList({
  segments,
  selectedSegmentId,
  onSegmentSelect,
  jobId,
}: SegmentListProps) {
  const approvedCount = segments.filter(
    (s) => s.status === "approved" && s.collectionId
  ).length;
  const excludedCount = segments.filter((s) => s.status === "excluded").length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <h3 className="font-semibold">Segments</h3>
        <div className="flex gap-2 text-muted-foreground text-xs">
          <span>{segments.length} total</span>
          <span>·</span>
          <span className="text-green-600">{approvedCount} assigned</span>
          <span>·</span>
          <span className="text-red-600">{excludedCount} excluded</span>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {segments.map((segment) => (
          <SegmentItem
            isSelected={selectedSegmentId === segment.id}
            jobId={jobId}
            key={segment.id}
            onClick={() => onSegmentSelect(segment.id)}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}

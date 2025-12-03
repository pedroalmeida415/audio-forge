"use client";

import { CollectionCombobox } from "~/components/clipping/collection-combobox";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";

type SegmentSelection = {
  selected: boolean;
  collectionId: string | null;
  projectId: string | null;
};

type SegmentListProps = {
  segments: DiarizationSegment[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  selections: Map<string, SegmentSelection>;
  onToggleSelection: (segmentId: string) => void;
  onSetCollection: (
    segmentId: string,
    collectionId: string | null,
    projectId: string | null
  ) => void;
  onCreateCollection: (
    name: string,
    projectId: string
  ) => Promise<{ id: string }>;
  isCreatingCollection?: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

function SegmentItem({
  segment,
  isActive,
  onClick,
  selection,
  onToggleSelection,
  onSetCollection,
  onCreateCollection,
  isCreatingCollection,
}: {
  segment: DiarizationSegment;
  isActive: boolean;
  onClick: () => void;
  selection: SegmentSelection | undefined;
  onToggleSelection: () => void;
  onSetCollection: (
    collectionId: string | null,
    projectId: string | null
  ) => void;
  onCreateCollection: (
    name: string,
    projectId: string
  ) => Promise<{ id: string }>;
  isCreatingCollection?: boolean;
}) {
  const isSelected = selection?.selected ?? false;

  async function handleCreateCollection(name: string, projectId: string) {
    const result = await onCreateCollection(name, projectId);
    onSetCollection(result.id, projectId);
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isActive && "border-primary bg-primary/5",
        isSelected && "bg-accent/50",
        !(isActive || isSelected) && "hover:border-muted-foreground/50"
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
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            className="mt-1"
            onCheckedChange={() => onToggleSelection()}
            onClick={(e) => e.stopPropagation()}
          />
          <div>
            <Badge className="mb-1" variant="outline">
              {segment.speaker}
            </Badge>
            <p className="text-muted-foreground text-xs">
              {formatTime(segment.start)} - {formatTime(segment.end)}
            </p>
          </div>
        </div>
      </div>

      {isSelected && (
        <div
          className="mt-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <CollectionCombobox
            disabled={isCreatingCollection}
            isCreatingCollection={isCreatingCollection}
            onCreateCollection={handleCreateCollection}
            onSelect={(collection) => {
              if (collection) {
                onSetCollection(collection.id, collection.projectId);
              } else {
                onSetCollection(null, null);
              }
            }}
            selectedCollectionId={selection?.collectionId ?? null}
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
  selections,
  onToggleSelection,
  onSetCollection,
  onCreateCollection,
  isCreatingCollection,
}: SegmentListProps) {
  const selectedCount = Array.from(selections.values()).filter(
    (s) => s.selected
  ).length;
  const assignedCount = Array.from(selections.values()).filter(
    (s) => s.selected && s.collectionId
  ).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <h3 className="font-semibold">Segments</h3>
        <div className="flex gap-2 text-muted-foreground text-xs">
          <span>{segments.length} total</span>
          <span>·</span>
          <span className="text-blue-600">{selectedCount} selected</span>
          <span>·</span>
          <span className="text-green-600">{assignedCount} assigned</span>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {segments.map((segment) => (
          <SegmentItem
            isActive={selectedSegmentId === segment.id}
            isCreatingCollection={isCreatingCollection}
            key={segment.id}
            onClick={() => onSegmentSelect(segment.id)}
            onCreateCollection={onCreateCollection}
            onSetCollection={(collectionId, projectId) =>
              onSetCollection(segment.id, collectionId, projectId)
            }
            onToggleSelection={() => onToggleSelection(segment.id)}
            segment={segment}
            selection={selections.get(segment.id)}
          />
        ))}
      </div>
    </div>
  );
}

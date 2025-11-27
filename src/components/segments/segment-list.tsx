"use client";

import { Check, ChevronsUpDown, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useSegmentActions } from "~/hooks/use-segment-actions";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

type Segment = {
  id: string;
  pyannoteSpeakerLabel: string;
  originalStartTime: number;
  originalEndTime: number;
  editedStartTime: number;
  editedEndTime: number;
  status: string;
  collectionId: string | null;
  collection: { id: string; name: string } | null;
};

type Collection = {
  id: string;
  name: string;
};

type SegmentListProps = {
  segments: Segment[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  projectId: string;
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
  collections,
  projectId,
  jobId,
}: {
  segment: Segment;
  isSelected: boolean;
  onClick: () => void;
  collections: Collection[];
  projectId: string;
  jobId: string;
}) {
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const {
    assignToCollection,
    toggleExcluded,
    resetTimestamps: resetTimestampsAction,
    createAndAssign,
    isPending,
  } = useSegmentActions({ jobId, projectId });

  const handleCollectionSelect = (collectionId: string | null) => {
    assignToCollection(segment.id, collectionId);
    setComboboxOpen(false);
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) {
      return;
    }
    createAndAssign(segment.id, newCollectionName.trim());
    setNewCollectionName("");
    setComboboxOpen(false);
  };

  const isExcluded = segment.status === "excluded";
  const hasTimestampChanges =
    segment.editedStartTime !== segment.originalStartTime ||
    segment.editedEndTime !== segment.originalEndTime;

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
          <Popover onOpenChange={setComboboxOpen} open={comboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={comboboxOpen}
                className="w-full justify-between"
                role="combobox"
                size="sm"
                variant="outline"
              >
                {segment.collection ? (
                  <span className="truncate">{segment.collection.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Assign to collection...
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[200px] p-0">
              <Command>
                <CommandInput
                  onValueChange={setNewCollectionName}
                  placeholder="Search or create..."
                  value={newCollectionName}
                />
                <CommandList>
                  <CommandEmpty>
                    {newCollectionName.trim() ? (
                      <Button
                        className="w-full"
                        disabled={isPending}
                        onClick={handleCreateCollection}
                        size="sm"
                        variant="ghost"
                      >
                        Create "{newCollectionName}"
                      </Button>
                    ) : (
                      "No collections found"
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {segment.collectionId && (
                      <CommandItem
                        onSelect={() => handleCollectionSelect(null)}
                        value="__unassign__"
                      >
                        <X className="mr-2 h-3 w-3" />
                        Unassign
                      </CommandItem>
                    )}
                    {collections.map((collection) => (
                      <CommandItem
                        key={collection.id}
                        onSelect={() => handleCollectionSelect(collection.id)}
                        value={collection.name}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3 w-3",
                            segment.collectionId === collection.id
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        {collection.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

export function SegmentList({
  segments,
  selectedSegmentId,
  onSegmentSelect,
  projectId,
  jobId,
}: SegmentListProps) {
  const { data: collections = [] } = api.collection.search.useQuery({
    projectId,
    limit: 20,
  });

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
            collections={collections}
            isSelected={selectedSegmentId === segment.id}
            jobId={jobId}
            key={segment.id}
            onClick={() => onSegmentSelect(segment.id)}
            projectId={projectId}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}

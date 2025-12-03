"use client";

import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { useMemo } from "react";
import { CollectionCombobox } from "~/components/clipping/collection-combobox";
import { SegmentItem } from "~/components/clipping/segment-item";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";

type SpeakerGroupCardProps = {
  speaker: string;
  speakerIndex: number;
  segments: DiarizationSegment[];
  isExpanded: boolean;
  collectionId: string | null;
  collectionName: string | null;
  projectName: string | null;
  activeSegmentId: string | null;
  onToggleExpanded: () => void;
  onSetCollection: (
    collectionId: string | null,
    collectionName: string | null,
    projectId: string | null,
    projectName: string | null
  ) => void;
  onSegmentSelect: (segmentId: string) => void;
  onSegmentExclude: (segmentId: string) => void;
  onSegmentReassign: (segmentId: string) => void;
  onCreateCollection: (name: string, projectId: string) => Promise<{
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  }>;
  isCreatingCollection: boolean;
};

function formatTotalDuration(segments: DiarizationSegment[]): string {
  const total = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function SpeakerGroupCard({
  speaker,
  speakerIndex,
  segments,
  isExpanded,
  collectionId,
  collectionName,
  projectName,
  activeSegmentId,
  onToggleExpanded,
  onSetCollection,
  onSegmentSelect,
  onSegmentExclude,
  onSegmentReassign,
  onCreateCollection,
  isCreatingCollection,
}: SpeakerGroupCardProps) {
  const color = useMemo(() => getSpeakerColor(speakerIndex), [speakerIndex]);
  const totalDuration = useMemo(
    () => formatTotalDuration(segments),
    [segments]
  );

  // Display name: collection name if assigned, otherwise speaker ID
  const displayName = collectionName || speaker;
  const hasCollection = !!collectionId;

  return (
    <Collapsible onOpenChange={onToggleExpanded} open={isExpanded}>
      <div
        className={cn(
          "rounded-lg border transition-all duration-200",
          "bg-card/50 hover:bg-card/80",
          hasCollection && "ring-1 ring-primary/20"
        )}
        style={{ borderLeftColor: color.border, borderLeftWidth: "3px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3">
          <CollapsibleTrigger asChild>
            <Button
              className="flex items-center gap-2 p-0 hover:bg-transparent"
              variant="ghost"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}

              {/* Speaker indicator */}
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md"
                style={{ backgroundColor: color.bg }}
              >
                <Users className="h-4 w-4" style={{ color: color.border }} />
              </div>

              {/* Name and stats */}
              <div className="flex flex-col items-start">
                <span
                  className={cn(
                    "font-medium text-sm",
                    hasCollection && "text-primary"
                  )}
                >
                  {displayName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {segments.length} segment{segments.length !== 1 && "s"} ·{" "}
                  {totalDuration}
                  {hasCollection && collectionName !== speaker && (
                    <span className="ml-1 opacity-60">({speaker})</span>
                  )}
                </span>
              </div>
            </Button>
          </CollapsibleTrigger>

          {/* Collection assignment */}
          <div className="flex items-center gap-2">
            {projectName && (
              <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                {projectName}
              </span>
            )}
            <CollectionCombobox
              compact
              isCreatingCollection={isCreatingCollection}
              onCreateCollection={async (name, projectId) => {
                const result = await onCreateCollection(name, projectId);
                onSetCollection(
                  result.id,
                  result.name,
                  result.projectId,
                  result.projectName
                );
              }}
              onSelect={(collection) => {
                if (collection) {
                  onSetCollection(
                    collection.id,
                    collection.name,
                    collection.projectId,
                    collection.projectName
                  );
                } else {
                  onSetCollection(null, null, null, null);
                }
              }}
              selectedCollectionId={collectionId}
            />
          </div>
        </div>

        {/* Segment list */}
        <CollapsibleContent>
          <div className="border-t px-2 py-2">
            <div className="max-h-[280px] space-y-0.5 overflow-y-auto">
              {segments.map((segment) => (
                <SegmentItem
                  isActive={segment.id === activeSegmentId}
                  key={segment.id}
                  onExclude={() => onSegmentExclude(segment.id)}
                  onReassign={() => onSegmentReassign(segment.id)}
                  onSelect={() => onSegmentSelect(segment.id)}
                  segment={segment}
                />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

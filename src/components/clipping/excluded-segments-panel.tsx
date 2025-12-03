"use client";

import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import type { ExcludedSegment } from "~/hooks/use-speaker-workspace";
import { cn } from "~/lib/utils";

type ExcludedSegmentsPanelProps = {
  excludedSegments: ExcludedSegment[];
  onRestore: (segmentId: string) => void;
  onRestoreAll: () => void;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

export function ExcludedSegmentsPanel({
  excludedSegments,
  onRestore,
  onRestoreAll,
}: ExcludedSegmentsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (excludedSegments.length === 0) {
    return null;
  }

  return (
    <Collapsible onOpenChange={setIsExpanded} open={isExpanded}>
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
        {/* Header */}
        <div className="flex items-center justify-between p-3">
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

              <Trash2 className="h-4 w-4 text-muted-foreground" />

              <span className="text-muted-foreground text-sm">
                Excluded Segments ({excludedSegments.length})
              </span>
            </Button>
          </CollapsibleTrigger>

          <Button
            className="h-7 text-xs"
            onClick={onRestoreAll}
            size="sm"
            variant="outline"
          >
            <RotateCcw className="mr-1.5 h-3 w-3" />
            Restore All
          </Button>
        </div>

        {/* Excluded segment list */}
        <CollapsibleContent>
          <div className="border-t border-dashed border-muted-foreground/30 px-3 py-2">
            <div className="max-h-[200px] space-y-1 overflow-y-auto">
              {excludedSegments.map(({ segment, originalSpeaker }) => (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2",
                    "bg-muted/30 text-muted-foreground"
                  )}
                  key={segment.id}
                >
                  <div className="flex items-center gap-3">
                    {/* Speaker badge */}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {originalSpeaker}
                    </span>

                    {/* Timestamps */}
                    <span className="font-mono text-sm">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </span>
                  </div>

                  <Button
                    className="h-7 text-xs"
                    onClick={() => onRestore(segment.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <RotateCcw className="mr-1.5 h-3 w-3" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

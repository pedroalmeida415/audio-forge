"use client";

import { ArrowRightLeft, Play, X } from "lucide-react";
import { memo } from "react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";

type SegmentItemProps = {
  segment: DiarizationSegment;
  isActive: boolean;
  onSelect: () => void;
  onExclude: () => void;
  onReassign: () => void;
  onPlayRegion?: () => void;
};

function arePropsEqual(prev: SegmentItemProps, next: SegmentItemProps) {
  return (
    prev.isActive === next.isActive &&
    prev.segment.id === next.segment.id &&
    prev.segment.start === next.segment.start &&
    prev.segment.end === next.segment.end
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

function formatDuration(start: number, end: number): string {
  const duration = end - start;
  return `${duration.toFixed(1)}s`;
}

export const SegmentItem = memo(function SegmentItem({
  segment,
  isActive,
  onSelect,
  onExclude,
  onReassign,
  onPlayRegion,
}: SegmentItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between rounded-md px-3 py-2 transition-all duration-150",
        "cursor-pointer hover:bg-accent/30",
        isActive && "bg-primary/10 ring-1 ring-primary/50"
      )}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      {/* Active indicator + timestamps */}
      <div className="flex items-center gap-3">
        {/* Active dot indicator */}
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-all",
            isActive ? "scale-125 bg-primary" : "bg-muted-foreground/30"
          )}
        />

        {/* Timestamps */}
        <div className="flex items-baseline gap-1.5 font-mono text-sm">
          <span className="text-foreground">{formatTime(segment.start)}</span>
          <span className="text-muted-foreground">-</span>
          <span className="text-foreground">{formatTime(segment.end)}</span>
        </div>

        {/* Duration badge */}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
          {formatDuration(segment.start, segment.end)}
        </span>
      </div>

      {/* Actions - appear on hover */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onPlayRegion && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayRegion();
                }}
                size="icon"
                variant="ghost"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Play segment</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onReassign();
              }}
              size="icon"
              variant="ghost"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Move to another speaker</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onExclude();
              }}
              size="icon"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Exclude segment</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}, arePropsEqual);

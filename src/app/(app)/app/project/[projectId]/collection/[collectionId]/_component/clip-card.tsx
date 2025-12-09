"use client";

import { Play } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ClipCardProps = {
  type: "original" | "processed";
  duration: number;
  mosScore: number | null;
  isEmpty?: boolean;
  onPlayClick?: () => void;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function ClipCard({
  type,
  duration,
  mosScore,
  isEmpty = false,
  onPlayClick,
}: ClipCardProps) {
  const label = type === "original" ? "Original Clip" : "Processed Clip";

  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-lg border bg-card p-3",
        isEmpty && "opacity-60",
      )}
    >
      <Button
        className="shrink-0 rounded-full"
        disabled={isEmpty}
        onClick={(e) => {
          e.stopPropagation();
          onPlayClick?.();
        }}
        size="icon-sm"
        variant="outline"
      >
        <Play className="size-4" />
      </Button>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">
          {isEmpty ? "--" : formatDuration(duration)}
        </span>
      </div>

      <Badge className="shrink-0" variant="secondary">
        {isEmpty || mosScore === null ? "--" : mosScore.toFixed(1)}
      </Badge>
    </div>
  );
}

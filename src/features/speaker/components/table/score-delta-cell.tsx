"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "~/lib/utils";

interface ScoreDeltaCellProps {
  originalScore: number | null;
  processedScore: number | null;
}

export function ScoreDeltaCell({
  originalScore,
  processedScore,
}: ScoreDeltaCellProps) {
  const delta =
    processedScore != null && originalScore != null
      ? processedScore - originalScore
      : null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <ArrowRight className="size-4 text-muted-foreground" />
      {delta !== null ? (
        <span
          className={cn(
            "font-medium font-mono text-xs",
            delta > 0
              ? "text-success"
              : delta < 0
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}
        </span>
      ) : (
        <span className="font-mono text-muted-foreground text-xs">--</span>
      )}
    </div>
  );
}

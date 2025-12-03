"use client";

import { cn } from "~/lib/utils";

type MOSBadgeProps = {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

/**
 * Get color class based on MOS score
 * 1.0-2.0: Poor (red)
 * 2.0-3.0: Fair (orange)
 * 3.0-4.0: Good (yellow)
 * 4.0-5.0: Excellent (green)
 */
function getMOSColor(score: number): string {
  if (score < 2.0) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (score < 3.0) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (score < 4.0) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
}

function getMOSLabel(score: number): string {
  if (score < 2.0) return "Poor";
  if (score < 3.0) return "Fair";
  if (score < 4.0) return "Good";
  return "Excellent";
}

export function MOSBadge({
  score,
  size = "md",
  showLabel = false,
  className,
}: MOSBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-md border bg-muted/50 text-muted-foreground",
          size === "sm" && "px-1.5 py-0.5 text-xs",
          size === "md" && "px-2 py-1 text-sm",
          size === "lg" && "px-3 py-1.5 text-base",
          className
        )}
      >
        <span className="font-mono">--</span>
        {showLabel && <span className="text-muted-foreground/70">MOS</span>}
      </div>
    );
  }

  const colorClass = getMOSColor(score);
  const label = getMOSLabel(score);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border",
        colorClass,
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "px-2 py-1 text-sm",
        size === "lg" && "px-3 py-1.5 text-base",
        className
      )}
      title={`MOS: ${score.toFixed(1)} - ${label}`}
    >
      <span className="font-mono font-semibold">{score.toFixed(1)}</span>
      {showLabel && (
        <span className="opacity-80">{label}</span>
      )}
    </div>
  );
}

/**
 * Compare two MOS scores and show improvement/degradation
 */
type MOSComparisonProps = {
  originalScore: number | null | undefined;
  processedScore: number | null | undefined;
  className?: string;
};

export function MOSComparison({
  originalScore,
  processedScore,
  className,
}: MOSComparisonProps) {
  if (
    originalScore === null ||
    originalScore === undefined ||
    processedScore === null ||
    processedScore === undefined
  ) {
    return null;
  }

  const diff = processedScore - originalScore;
  const isImproved = diff > 0;
  const isDegraded = diff < 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MOSBadge score={originalScore} size="sm" />
      <span className="text-muted-foreground">→</span>
      <MOSBadge score={processedScore} size="sm" />
      {diff !== 0 && (
        <span
          className={cn(
            "text-xs font-medium",
            isImproved && "text-emerald-400",
            isDegraded && "text-red-400"
          )}
        >
          {isImproved ? "+" : ""}
          {diff.toFixed(1)}
        </span>
      )}
    </div>
  );
}

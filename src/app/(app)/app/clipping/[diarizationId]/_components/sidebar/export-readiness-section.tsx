"use client";

import { cn } from "~/lib/utils";
import { useClippingStore } from "../../_context/store.context";
import { calculateStats } from "../../_utils/segment-utils";

export function ExportReadinessSection() {
  const segmentsById = useClippingStore((s) => s.segments.segmentsById);
  const selectedSpeaker = useClippingStore((s) => s.segments.selectedSpeaker);

  let segments = Object.values(segmentsById);
  if (selectedSpeaker) {
    segments = segments.filter((s) => s.speaker === selectedSpeaker);
  }
  const stats = calculateStats(segments);

  const percentage =
    stats.segmentCount > 0
      ? Math.round((stats.reviewedCount / stats.segmentCount) * 100)
      : 0;

  // SVG circle calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const status =
    percentage >= 80 ? "good" : percentage >= 50 ? "moderate" : "low";

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Export Readiness
      </h3>

      <div className="flex flex-col items-center py-2">
        {/* Quality ring */}
        <div className="relative h-20 w-20">
          <svg
            className="-rotate-90"
            viewBox="0 0 80 80"
            width="80"
            height="80"
            aria-hidden="true"
          >
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted"
            />
            {/* Progress circle */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={cn(
                "transition-all duration-500",
                status === "good" && "text-green-500",
                status === "moderate" && "text-amber-500",
                status === "low" && "text-muted-foreground",
              )}
            />
          </svg>
          {/* Percentage text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-semibold text-xl">{percentage}%</span>
          </div>
        </div>

        {/* Status text */}
        <div className="mt-2 text-center">
          <div className="text-muted-foreground text-xs">
            {stats.reviewedCount} of {stats.segmentCount} reviewed
          </div>
          <div
            className={cn(
              "font-medium text-sm",
              status === "good" && "text-green-500",
              status === "moderate" && "text-amber-500",
              status === "low" && "text-muted-foreground",
            )}
          >
            {status === "good" && "Good to export"}
            {status === "moderate" && "Needs review"}
            {status === "low" && "Review segments"}
          </div>
        </div>
      </div>
    </div>
  );
}

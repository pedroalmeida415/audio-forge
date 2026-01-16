"use client";

import { Loader2 } from "lucide-react";
import { api } from "~/trpc/react";

// ============================================================================
// Types
// ============================================================================

interface QueueCountProps {
  label: string;
  waiting: number;
  active: number;
}

// ============================================================================
// Queue Count Display Component
// ============================================================================

/**
 * Displays waiting and active counts for a single queue type.
 */
function QueueCount({ label, waiting, active }: QueueCountProps) {
  const hasActivity = waiting > 0 || active > 0;

  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        {active > 0 && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        )}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{waiting}</span> waiting
        </span>
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{active}</span> active
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Queue Status Component
// ============================================================================

/**
 * Queue status section for speaker sidebar.
 *
 * Polls getQueueStatus every 5 seconds to display current state of:
 * - Clip processing queue (waiting and active jobs)
 * - Transcription queue (waiting and active jobs)
 *
 * Shows a processing indicator when any jobs are active.
 */
export function QueueStatus() {
  const { data, isLoading } = api.speaker.getQueueStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // Calculate totals for header indicator
  const totalActive =
    (data?.clipProcessing.active ?? 0) + (data?.transcription.active ?? 0);
  const totalWaiting =
    (data?.clipProcessing.waiting ?? 0) + (data?.transcription.waiting ?? 0);
  const isProcessing = totalActive > 0 || totalWaiting > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Header with processing indicator */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Queue Status</h2>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isProcessing ? (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Idle</span>
        )}
      </div>

      {/* Queue counts */}
      <div className="flex flex-col gap-2">
        <QueueCount
          label="Clip Processing"
          waiting={data?.clipProcessing.waiting ?? 0}
          active={data?.clipProcessing.active ?? 0}
        />
        <QueueCount
          label="Transcription"
          waiting={data?.transcription.waiting ?? 0}
          active={data?.transcription.active ?? 0}
        />
      </div>

      {/* Totals summary when processing */}
      {isProcessing && (
        <p className="text-muted-foreground text-xs">
          {totalActive} active, {totalWaiting} waiting
        </p>
      )}
    </div>
  );
}

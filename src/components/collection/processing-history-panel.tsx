"use client";

import {
  AlertCircle,
  AudioLines,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  History,
  Loader2,
  Music,
  Pause,
  Play,
  Sparkles,
  Trash2,
  TrendingUp,
  Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { MOSBadge, MOSComparison } from "~/components/collection/mos-badge";
import { cn } from "~/lib/utils";
import type { ProcessingStatus, ProcessingType } from "~/server/db/schema";

type ProcessedClipInfo = {
  id: string;
  processingType: ProcessingType;
  processingStatus: ProcessingStatus;
  processingParams?: Record<string, unknown> | null;
  mosScore?: number | null;
  durationSeconds?: number | null;
  sampleRate?: number | null;
  format?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
};

const PROCESSING_TYPE_INFO: Record<
  ProcessingType,
  { label: string; icon: typeof Sparkles }
> = {
  denoise: { label: "Denoise", icon: Sparkles },
  remove_bg_music: { label: "Remove BG Music", icon: Music },
  remove_overlap: { label: "Remove Overlap", icon: AudioLines },
  normalize: { label: "Normalize", icon: Volume2 },
  upsample: { label: "Upsample", icon: TrendingUp },
};

type ProcessingHistoryPanelProps = {
  originalMosScore?: number | null;
  processedClips: ProcessedClipInfo[];
  onPlay: (processedClipId: string) => void;
  onDownload: (processedClipId: string) => void;
  onDelete: (processedClipId: string) => void;
  currentlyPlayingId?: string | null;
  isDeleting?: string | null;
  className?: string;
};

export function ProcessingHistoryPanel({
  originalMosScore,
  processedClips,
  onPlay,
  onDownload,
  onDelete,
  currentlyPlayingId,
  isDeleting,
  className,
}: ProcessingHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (processedClips.length === 0) {
    return null;
  }

  const completedClips = processedClips.filter(
    (c) => c.processingStatus === "completed"
  );
  const pendingClips = processedClips.filter(
    (c) =>
      c.processingStatus === "pending" || c.processingStatus === "processing"
  );
  const failedClips = processedClips.filter(
    (c) => c.processingStatus === "failed"
  );

  return (
    <div className={cn("space-y-2", className)}>
      <button
        className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            Processing History ({processedClips.length})
          </span>
          {pendingClips.length > 0 && (
            <span className="flex items-center gap-1 text-primary text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pendingClips.length} processing
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-2 pl-2">
          {/* Pending/Processing */}
          {pendingClips.map((clip) => (
            <ProcessingHistoryItem
              clip={clip}
              isPlaying={false}
              key={clip.id}
              onDelete={onDelete}
              onDownload={onDownload}
              onPlay={onPlay}
              originalMosScore={originalMosScore}
            />
          ))}

          {/* Completed */}
          {completedClips.map((clip) => (
            <ProcessingHistoryItem
              clip={clip}
              isDeleting={isDeleting === clip.id}
              isPlaying={currentlyPlayingId === clip.id}
              key={clip.id}
              onDelete={onDelete}
              onDownload={onDownload}
              onPlay={onPlay}
              originalMosScore={originalMosScore}
            />
          ))}

          {/* Failed */}
          {failedClips.map((clip) => (
            <ProcessingHistoryItem
              clip={clip}
              isPlaying={false}
              key={clip.id}
              onDelete={onDelete}
              onDownload={onDownload}
              onPlay={onPlay}
              originalMosScore={originalMosScore}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ProcessingHistoryItemProps = {
  clip: ProcessedClipInfo;
  originalMosScore?: number | null;
  onPlay: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  isPlaying?: boolean;
  isDeleting?: boolean;
};

function ProcessingHistoryItem({
  clip,
  originalMosScore,
  onPlay,
  onDownload,
  onDelete,
  isPlaying = false,
  isDeleting = false,
}: ProcessingHistoryItemProps) {
  const typeInfo = PROCESSING_TYPE_INFO[clip.processingType];
  const Icon = typeInfo.icon;

  const isCompleted = clip.processingStatus === "completed";
  const isPending =
    clip.processingStatus === "pending" ||
    clip.processingStatus === "processing";
  const isFailed = clip.processingStatus === "failed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2",
        isCompleted && "border-border/50 bg-background",
        isPending && "border-primary/30 bg-primary/5",
        isFailed && "border-destructive/30 bg-destructive/5"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          isCompleted && "bg-muted",
          isPending && "bg-primary/10",
          isFailed && "bg-destructive/10"
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : isFailed ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{typeInfo.label}</span>
          {isCompleted && clip.mosScore !== null && clip.mosScore !== undefined && (
            <MOSComparison
              originalScore={originalMosScore}
              processedScore={clip.mosScore}
            />
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Clock className="h-3 w-3" />
          <span>
            {clip.createdAt.toLocaleDateString()}{" "}
            {clip.createdAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {clip.sampleRate && (
            <span className="text-muted-foreground/70">
              {(clip.sampleRate / 1000).toFixed(1)}kHz
            </span>
          )}
        </div>

        {isFailed && clip.errorMessage && (
          <p className="mt-1 truncate text-destructive text-xs">
            {clip.errorMessage}
          </p>
        )}
      </div>

      {/* Actions */}
      {isCompleted && (
        <div className="flex items-center gap-1">
          <Button
            onClick={() => onPlay(clip.id)}
            size="icon-sm"
            title={isPlaying ? "Pause" : "Play processed clip"}
            variant="ghost"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={() => onDownload(clip.id)}
            size="icon-sm"
            title="Download"
            variant="ghost"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            disabled={isDeleting}
            onClick={() => onDelete(clip.id)}
            size="icon-sm"
            title="Delete"
            variant="ghost"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {isFailed && (
        <Button
          disabled={isDeleting}
          onClick={() => onDelete(clip.id)}
          size="icon-sm"
          title="Remove failed entry"
          variant="ghost"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

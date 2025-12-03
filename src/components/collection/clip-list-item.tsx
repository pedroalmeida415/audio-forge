"use client";

import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { MOSBadge } from "~/components/collection/mos-badge";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";
import type { ProcessingStatus, ProcessingType } from "~/server/db/schema";

type ProcessedClipInfo = {
  id: string;
  processingType: ProcessingType;
  processingStatus: ProcessingStatus;
  mosScore?: number | null;
};

type ClipData = {
  id: string;
  durationSeconds: number;
  extractedStartTime: number;
  extractedEndTime: number;
  format: string;
  transcript?: string | null;
  transcriptMetadata?: {
    language?: string;
    provider?: string;
    confidence?: number;
  } | null;
  mosScore?: number | null;
  createdAt: Date;
  sourceSpeakerLabel: string | null;
  sourceFilename: string | null;
  processedClips?: ProcessedClipInfo[];
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ClipListItemProps = {
  clip: ClipData;
  audioUrl?: string;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
};

export function ClipListItem({
  clip,
  audioUrl,
  isSelected = false,
  onSelect,
  onClick,
  isActive = false,
  className,
}: ClipListItemProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasTranscript = clip.transcript && clip.transcript.trim().length > 0;
  const hasMOS = clip.mosScore !== null && clip.mosScore !== undefined;

  // Processing status indicators
  const pendingCount = clip.processedClips?.filter(
    (c) => c.processingStatus === "pending" || c.processingStatus === "processing"
  ).length ?? 0;
  const completedCount = clip.processedClips?.filter(
    (c) => c.processingStatus === "completed"
  ).length ?? 0;
  const failedCount = clip.processedClips?.filter(
    (c) => c.processingStatus === "failed"
  ).length ?? 0;

  function handlePlayPause(e: React.MouseEvent) {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function handleCheckboxChange(checked: boolean) {
    onSelect?.(checked);
  }

  function handleRowClick() {
    onClick?.();
  }

  // Truncate transcript for preview
  const transcriptPreview = clip.transcript
    ? clip.transcript.length > 80
      ? `${clip.transcript.slice(0, 80)}...`
      : clip.transcript
    : null;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border p-3 transition-all cursor-pointer",
        isActive
          ? "border-primary bg-primary/5"
          : "border-border/50 bg-background hover:border-border hover:bg-muted/30",
        isSelected && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background",
        className
      )}
      onClick={handleRowClick}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
          />
        </div>
      )}

      {/* Play button */}
      <button
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
          isPlaying
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-muted/50 hover:border-primary hover:bg-primary/10"
        )}
        disabled={!audioUrl}
        onClick={handlePlayPause}
        type="button"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </button>

      {audioUrl && (
        // biome-ignore lint/a11y/useMediaCaption: Audio clips are speech samples
        <audio
          className="hidden"
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          ref={audioRef}
          src={audioUrl}
        />
      )}

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Top row: speaker, duration, format */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">
            {clip.sourceSpeakerLabel ?? "Unknown Speaker"}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground shrink-0">
            {formatDuration(clip.durationSeconds)}
          </span>
          <span className="text-muted-foreground uppercase text-xs shrink-0">
            {clip.format}
          </span>
        </div>

        {/* Second row: timestamps */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            {formatTimestamp(clip.extractedStartTime)} - {formatTimestamp(clip.extractedEndTime)}
          </span>
        </div>

        {/* Transcript preview */}
        {transcriptPreview ? (
          <p className="text-sm text-muted-foreground line-clamp-2" title={clip.transcript ?? undefined}>
            "{transcriptPreview}"
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">
            No transcription
          </p>
        )}
      </div>

      {/* Right side: status indicators */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {/* MOS score */}
        <MOSBadge score={clip.mosScore} size="sm" />

        {/* Processing status badges */}
        <div className="flex items-center gap-1.5">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pendingCount}
            </span>
          )}
          {completedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <Sparkles className="h-3 w-3" />
              {completedCount}
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {failedCount}
            </span>
          )}
          {!hasTranscript && (
            <span className="text-xs text-muted-foreground/50" title="No transcription">
              T
            </span>
          )}
          {hasTranscript && (
            <span className="text-xs text-emerald-500" title="Has transcription">
              <Check className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

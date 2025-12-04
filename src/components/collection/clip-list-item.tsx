"use client";

import {
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

const PROCESSING_TYPE_LABELS: Record<ProcessingType, string> = {
  denoise: "Denoised",
  remove_bg_music: "BG Removed",
  remove_overlap: "Overlap Removed",
  normalize: "Normalized",
  upsample: "Upsampled",
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
  processedAudioUrl?: string;
  latestProcessedId?: string | null;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
};

export function ClipListItem({
  clip,
  audioUrl,
  processedAudioUrl,
  latestProcessedId,
  isSelected = false,
  onSelect,
  onClick,
  isActive = false,
  className,
}: ClipListItemProps) {
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [isPlayingProcessed, setIsPlayingProcessed] = useState(false);
  const originalAudioRef = useRef<HTMLAudioElement>(null);
  const processedAudioRef = useRef<HTMLAudioElement>(null);

  const hasTranscript = clip.transcript && clip.transcript.trim().length > 0;

  // Get latest completed processed clip
  const completedProcessed = clip.processedClips?.filter(
    (c) => c.processingStatus === "completed"
  ) ?? [];
  const latestProcessed = latestProcessedId
    ? completedProcessed.find((c) => c.id === latestProcessedId)
    : completedProcessed.length > 0
      ? completedProcessed[completedProcessed.length - 1]
      : null;

  // Processing status counts
  const pendingCount = clip.processedClips?.filter(
    (c) => c.processingStatus === "pending" || c.processingStatus === "processing"
  ).length ?? 0;

  function handlePlayPauseOriginal(e: React.MouseEvent) {
    e.stopPropagation();
    if (!originalAudioRef.current) return;

    // Stop processed audio if playing
    if (processedAudioRef.current && isPlayingProcessed) {
      processedAudioRef.current.pause();
      setIsPlayingProcessed(false);
    }

    if (isPlayingOriginal) {
      originalAudioRef.current.pause();
    } else {
      originalAudioRef.current.play();
    }
  }

  function handlePlayPauseProcessed(e: React.MouseEvent) {
    e.stopPropagation();
    if (!processedAudioRef.current) return;

    // Stop original audio if playing
    if (originalAudioRef.current && isPlayingOriginal) {
      originalAudioRef.current.pause();
      setIsPlayingOriginal(false);
    }

    if (isPlayingProcessed) {
      processedAudioRef.current.pause();
    } else {
      processedAudioRef.current.play();
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
    ? clip.transcript.length > 120
      ? `${clip.transcript.slice(0, 120)}...`
      : clip.transcript
    : null;

  return (
    <div
      className={cn(
        "group rounded-lg border p-4 transition-all cursor-pointer",
        isActive
          ? "border-primary bg-primary/5"
          : "border-border/50 bg-background hover:border-border hover:bg-muted/30",
        isSelected && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background",
        className
      )}
      onClick={handleRowClick}
    >
      {/* Top row: checkbox, speaker info, timestamps */}
      <div className="flex items-center gap-3 mb-3">
        {/* Selection checkbox */}
        {onSelect && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium truncate">
            {clip.sourceSpeakerLabel ?? "Unknown Speaker"}
          </span>
          <span className="text-muted-foreground text-sm">•</span>
          <span className="text-muted-foreground text-sm flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {formatTimestamp(clip.extractedStartTime)} - {formatTimestamp(clip.extractedEndTime)}
          </span>
          <span className="text-muted-foreground text-sm">•</span>
          <span className="text-muted-foreground text-sm shrink-0">
            {formatDuration(clip.durationSeconds)}
          </span>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </span>
          )}
          {hasTranscript && (
            <span className="flex items-center gap-1 text-xs text-emerald-500" title="Has transcription">
              <Check className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      {/* Audio comparison row: Original | Processed */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* Original audio */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <button
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
              isPlayingOriginal
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:border-primary hover:bg-primary/10"
            )}
            disabled={!audioUrl}
            onClick={handlePlayPauseOriginal}
            type="button"
          >
            {isPlayingOriginal ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>

          {audioUrl && (
            // biome-ignore lint/a11y/useMediaCaption: Audio clips are speech samples
            <audio
              className="hidden"
              onEnded={() => setIsPlayingOriginal(false)}
              onPause={() => setIsPlayingOriginal(false)}
              onPlay={() => setIsPlayingOriginal(true)}
              ref={originalAudioRef}
              src={audioUrl}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Original</span>
              <MOSBadge score={clip.mosScore} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground uppercase mt-0.5">
              {clip.format}
            </p>
          </div>
        </div>

        {/* Processed audio (or empty state) */}
        <div className={cn(
          "flex items-center gap-3 rounded-lg border p-3",
          latestProcessed
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-muted/10 border-dashed"
        )}>
          {latestProcessed ? (
            <>
              <button
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                  isPlayingProcessed
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-500 hover:bg-emerald-500/20 text-emerald-500"
                )}
                disabled={!processedAudioUrl}
                onClick={handlePlayPauseProcessed}
                type="button"
              >
                {isPlayingProcessed ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </button>

              {processedAudioUrl && (
                // biome-ignore lint/a11y/useMediaCaption: Audio clips are speech samples
                <audio
                  className="hidden"
                  onEnded={() => setIsPlayingProcessed(false)}
                  onPause={() => setIsPlayingProcessed(false)}
                  onPlay={() => setIsPlayingProcessed(true)}
                  ref={processedAudioRef}
                  src={processedAudioUrl}
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {PROCESSING_TYPE_LABELS[latestProcessed.processingType]}
                  </span>
                  <MOSBadge score={latestProcessed.mosScore} size="sm" />
                </div>
                {completedProcessed.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    +{completedProcessed.length - 1} more version{completedProcessed.length > 2 ? "s" : ""}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/30">
                <Sparkles className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">No processed version</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Select to add processing</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transcription row */}
      <div className="rounded-lg border bg-muted/10 px-3 py-2">
        {transcriptPreview ? (
          <p className="text-sm text-foreground/80 line-clamp-2" title={clip.transcript ?? undefined}>
            "{transcriptPreview}"
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">
            No transcription yet
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Loader2,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { MOSBadge } from "~/components/collection/mos-badge";
import { ProcessingOptionsPanel } from "~/components/collection/processing-options-panel";
import { ProcessingHistoryPanel } from "~/components/collection/processing-history-panel";
import { TranscriptionEditor } from "~/components/collection/transcription-editor";
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
  segment: {
    pyannoteSpeakerLabel: string;
    job: {
      originalFilename: string | null;
    };
  };
  processedClips?: ProcessedClipInfo[];
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ClipProcessingCardProps = {
  clip: ClipData;
  audioUrl?: string;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onDelete?: () => void;
  onProcess?: (
    processingType: ProcessingType,
    params: Record<string, number>
  ) => void;
  onSaveTranscript?: (transcript: string) => void;
  onAutoTranscribe?: () => void;
  onClearTranscript?: () => void;
  onCalculateMOS?: () => void;
  onPlayProcessed?: (processedClipId: string) => void;
  onDownloadProcessed?: (processedClipId: string) => void;
  onDeleteProcessed?: (processedClipId: string) => void;
  getProcessedClipUrl?: (processedClipId: string) => string | undefined;
  isProcessing?: boolean;
  isSavingTranscript?: boolean;
  isTranscribing?: boolean;
  isCalculatingMOS?: boolean;
  isDeleting?: boolean;
  isDeletingProcessed?: string | null;
  className?: string;
};

export function ClipProcessingCard({
  clip,
  audioUrl,
  isSelected = false,
  onSelect,
  onDelete,
  onProcess,
  onSaveTranscript,
  onAutoTranscribe,
  onClearTranscript,
  onCalculateMOS,
  onPlayProcessed,
  onDownloadProcessed,
  onDeleteProcessed,
  getProcessedClipUrl,
  isProcessing = false,
  isSavingTranscript = false,
  isTranscribing = false,
  isCalculatingMOS = false,
  isDeleting = false,
  isDeletingProcessed = null,
  className,
}: ClipProcessingCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentlyPlayingProcessedId, setCurrentlyPlayingProcessedId] =
    useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const processedAudioRef = useRef<HTMLAudioElement>(null);

  function handlePlayPause() {
    if (!audioRef.current) return;

    // Stop any processed clip playing
    if (processedAudioRef.current) {
      processedAudioRef.current.pause();
      setCurrentlyPlayingProcessedId(null);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function handlePlayProcessed(processedClipId: string) {
    // Stop original clip
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (currentlyPlayingProcessedId === processedClipId) {
      // Toggle pause
      if (processedAudioRef.current) {
        processedAudioRef.current.pause();
      }
      setCurrentlyPlayingProcessedId(null);
    } else {
      // Play new processed clip
      setCurrentlyPlayingProcessedId(processedClipId);
    }

    onPlayProcessed?.(processedClipId);
  }

  function handleDownloadProcessed(processedClipId: string) {
    const url = getProcessedClipUrl?.(processedClipId);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `processed-${processedClipId}.wav`;
      a.click();
    }
    onDownloadProcessed?.(processedClipId);
  }

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
        {/* Selection checkbox */}
        {onSelect && (
          <Checkbox
            checked={isSelected}
            className="mt-1"
            onCheckedChange={onSelect}
          />
        )}

        {/* Clip info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-muted-foreground">
                  {clip.segment.pyannoteSpeakerLabel}
                </span>
                <MOSBadge score={clip.mosScore} size="sm" />
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {clip.segment.job.originalFilename ?? "Unknown source"}
              </p>
            </div>

            <Button
              disabled={isDeleting}
              onClick={onDelete}
              size="icon-sm"
              title="Delete clip"
              variant="ghost"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              )}
            </Button>
          </div>

          {/* Timestamps */}
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTimestamp(clip.extractedStartTime)} -{" "}
              {formatTimestamp(clip.extractedEndTime)}
            </span>
            <span className="font-medium">
              {formatDuration(clip.durationSeconds)}
            </span>
            <span className="text-muted-foreground uppercase">
              {clip.format}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Audio player - Original */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Original
            </span>
            <MOSBadge score={clip.mosScore} size="sm" />
            {clip.mosScore === null && onCalculateMOS && (
              <Button
                className="h-6 px-2 text-xs"
                disabled={isCalculatingMOS}
                onClick={onCalculateMOS}
                size="sm"
                variant="ghost"
              >
                {isCalculatingMOS ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Calculate MOS"
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={!audioUrl}
              onClick={handlePlayPause}
              size="icon-sm"
              variant="outline"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

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

            {/* Progress bar placeholder */}
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full bg-primary/50 transition-all",
                  isPlaying && "animate-pulse"
                )}
                style={{ width: isPlaying ? "100%" : "0%" }}
              />
            </div>

            {audioUrl && (
              <Button
                asChild
                size="icon-sm"
                title="Download original"
                variant="ghost"
              >
                <a download={`clip-${clip.id}.${clip.format}`} href={audioUrl}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Expand/collapse for more options */}
        <Button
          className="w-full justify-between"
          onClick={() => setIsExpanded(!isExpanded)}
          size="sm"
          variant="ghost"
        >
          <span>
            {isExpanded ? "Hide Options" : "Show Processing & Transcription"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        {isExpanded && (
          <>
            {/* Processing options */}
            {onProcess && (
              <ProcessingOptionsPanel
                disabled={isProcessing}
                isProcessing={isProcessing}
                onProcess={onProcess}
              />
            )}

            {/* Processing history */}
            {clip.processedClips && clip.processedClips.length > 0 && (
              <ProcessingHistoryPanel
                currentlyPlayingId={currentlyPlayingProcessedId}
                isDeleting={isDeletingProcessed}
                onDelete={onDeleteProcessed ?? (() => {})}
                onDownload={handleDownloadProcessed}
                onPlay={handlePlayProcessed}
                originalMosScore={clip.mosScore}
                processedClips={clip.processedClips}
              />
            )}

            {/* Transcription editor */}
            {onSaveTranscript && onAutoTranscribe && onClearTranscript && (
              <TranscriptionEditor
                clipId={clip.id}
                initialTranscript={clip.transcript}
                isSaving={isSavingTranscript}
                isTranscribing={isTranscribing}
                onAutoTranscribe={onAutoTranscribe}
                onClear={onClearTranscript}
                onSave={onSaveTranscript}
                transcriptMetadata={clip.transcriptMetadata}
              />
            )}
          </>
        )}

        <p className="text-muted-foreground text-xs">
          Extracted {clip.createdAt.toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

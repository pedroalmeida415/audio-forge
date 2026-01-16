"use client";

import { FileAudio2, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import type { SegmentWithClip } from "../store/speaker-store";
import { ClipAudioPlayer } from "./clip-audio-player";
import { SegmentAudioPlayer } from "./segment-audio-player";

interface SegmentUnitCardProps {
  segment: SegmentWithClip;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDeleteClip: (clipId: string) => void;
  onTranscriptionChange: (text: string) => void;
}

/**
 * Format milliseconds as mm:ss.ms
 */
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
}

/**
 * Segment unit card component.
 *
 * Displays a segment with its associated clip (if any) and transcription.
 * Layout:
 * - Row 1: Selection checkbox | Segment player (left) | Clip player or "No clip" (right) | Delete button
 * - Row 2: Transcription text or empty state
 */
export function SegmentUnitCard({
  segment,
  isSelected,
  onToggleSelect,
  onDeleteClip,
  onTranscriptionChange: _onTranscriptionChange,
}: SegmentUnitCardProps) {
  const durationMs = (segment.endTime - segment.startTime) * 1000;
  const hasClip = segment.clip !== null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      {/* Top row: Audio players */}
      <div className="flex items-center gap-4">
        {/* Selection checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label="Select segment"
        />

        {/* Segment audio player */}
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Segment
          </span>
          <SegmentAudioPlayer
            storageKey={segment.session.fileStorageKey}
            startMs={segment.startTime * 1000}
            endMs={segment.endTime * 1000}
            label="Segment"
          />
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Clip audio player or "No clip" indicator */}
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Clip
          </span>
          {hasClip && segment.clip ? (
            <ClipAudioPlayer
              clipId={segment.clip.id}
              storageKey={segment.clip.storageKey ?? ""}
              mosScore={segment.clip.mosScore}
              isDenoised={segment.clip.isDenoised ?? false}
              hasOverlapRemoved={segment.clip.hasOverlapRemoved ?? false}
            />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileAudio2 className="h-4 w-4" />
              <span className="text-xs">No clip</span>
            </div>
          )}
        </div>

        {/* Duration label */}
        <div className="flex flex-col items-end gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Duration
          </span>
          <span className="font-mono text-sm">
            {formatDuration(durationMs)}
          </span>
        </div>

        {/* Delete clip button (only shown if clip exists) */}
        {segment.clip && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              if (segment.clip) {
                onDeleteClip(segment.clip.id);
              }
            }}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete clip"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Transcription row */}
      <div className="mt-3 border-border border-t pt-3">
        {segment.transcription ? (
          <p className="text-sm leading-relaxed">{segment.transcription}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            No transcription
          </p>
        )}
      </div>
    </div>
  );
}

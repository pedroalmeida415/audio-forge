"use client";

import { useValue } from "@legendapp/state/react";
import { Loader2, Pause, Play } from "lucide-react";
import type { CSSProperties } from "react";
import { useSpeakersStore } from "~/features/speakers/context/speakers.context";
import type { SpeakerSegment } from "~/features/speakers/store/speakers-store";
import { formatDuration, formatTimestamp } from "~/lib/time-utils";
import { cn } from "~/lib/utils";

interface SegmentRowProps {
  segment: SpeakerSegment;
  style: CSSProperties;
}

export function SegmentRow({ segment, style }: SegmentRowProps) {
  const $store = useSpeakersStore();

  // Subscribe to this segment's playing state only
  const playingState = useValue(() =>
    $store.playingSegments[segment.id]?.get(),
  );

  const status = playingState?.status;
  const progress = playingState?.progress ?? 0;
  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const hasError = status === "error";

  const duration = segment.endTime - segment.startTime;

  const handlePlayClick = async () => {
    if (isLoading) return;

    if (isPlaying) {
      $store.pauseSegment(segment.id);
    } else if (isPaused) {
      $store.resumeSegment(segment.id);
    } else {
      await $store.playSegment(segment.id);
    }
  };

  return (
    <div
      style={style}
      className={cn(
        "flex items-center gap-4 border-border/50 border-b px-4",
        hasError && "bg-destructive/5",
      )}
    >
      {/* Play/Pause button */}
      <button
        type="button"
        onClick={handlePlayClick}
        disabled={isLoading || !segment.storageKey}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          "hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
          isPlaying && "bg-primary/10 text-primary",
        )}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </button>

      {/* Progress bar - only shown when playing/paused */}
      {(isPlaying || isPaused) && (
        <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Timestamps */}
      <span className="shrink-0 font-mono text-muted-foreground text-sm">
        {formatTimestamp(segment.startTime)} -{" "}
        {formatTimestamp(segment.endTime)}
      </span>

      {/* Duration badge */}
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
        {formatDuration(duration)}
      </span>

      {/* Error message */}
      {hasError && (
        <span className="text-destructive text-sm">
          {playingState?.error ?? "Error"}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}

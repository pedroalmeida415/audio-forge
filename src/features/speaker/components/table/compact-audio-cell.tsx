"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

type AudioState = "idle" | "loading" | "ready" | "error";

interface CompactAudioCellProps {
  audioState: AudioState;
  audioUrl: string | null;
  onLoadAudio: () => Promise<void>;
  duration: number;
  score: number | null;
  variant: "original" | "processed";
}

export function CompactAudioCell({
  audioState,
  audioUrl,
  onLoadAudio,
  duration: expectedDuration,
  score,
  variant,
}: CompactAudioCellProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(expectedDuration);

  // Update duration when audio loads
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl]);

  const handlePlayPause = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // If not loaded yet, load first
      if (audioState === "idle") {
        await onLoadAudio();
        return;
      }

      if (audioState === "loading") return;

      const audio = audioRef.current;
      if (!audio || !audioUrl) return;

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    },
    [audioState, audioUrl, isPlaying, onLoadAudio],
  );

  // Auto-play when audio becomes ready
  useEffect(() => {
    if (audioState === "ready" && audioUrl && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true));
    }
  }, [audioState, audioUrl]);

  const isLoading = audioState === "loading";
  const isDisabled = audioState === "error";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const scoreColor =
    score === null
      ? "text-muted-foreground"
      : score >= 4
        ? "text-success"
        : score >= 3
          ? "text-warning"
          : "text-destructive";

  return (
    <div className="flex items-center gap-2">
      {/* Play/Pause button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePlayPause}
        disabled={isDisabled}
        className={cn(
          "size-6 shrink-0 rounded-full",
          variant === "processed" && "text-primary",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3" fill="currentColor" />
        ) : (
          <Play className="size-3 translate-x-0.5" fill="currentColor" />
        )}
      </Button>

      {/* Progress bar and duration */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              variant === "original" ? "bg-muted-foreground/50" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {duration.toFixed(1)}s
        </span>
      </div>

      {/* Score display - large and prominent */}
      {score !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "shrink-0 cursor-help font-bold font-mono text-lg tabular-nums",
                scoreColor,
              )}
            >
              {score.toFixed(1)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span>Quality Score (MOS)</span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="shrink-0 font-mono text-lg text-muted-foreground/50">
          --
        </span>
      )}

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
    </div>
  );
}

// Placeholder cell for when clip doesn't exist yet
interface PlaceholderAudioCellProps {
  isPending?: boolean;
}

export function PlaceholderAudioCell({ isPending }: PlaceholderAudioCellProps) {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground">
      {isPending ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          <span className="text-xs">Processing...</span>
        </>
      ) : (
        <span className="text-xs">No clip</span>
      )}
    </div>
  );
}

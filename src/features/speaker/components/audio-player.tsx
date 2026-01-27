"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

type AudioState = "idle" | "loading" | "ready" | "error";

interface AudioPlayerProps {
  label: string;
  audioState: AudioState;
  audioUrl: string | null;
  onLoadAudio: () => Promise<void>;
  duration?: number;
  score: number | null;
  variant: "original" | "processed";
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

export function AudioPlayer({
  label,
  audioState,
  audioUrl,
  onLoadAudio,
  duration: expectedDuration,
  score,
  variant,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(expectedDuration ?? 0);

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

  const handlePlayPause = useCallback(async () => {
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
  }, [audioState, audioUrl, isPlaying, onLoadAudio]);

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
        ? "text-emerald-500"
        : score >= 3
          ? "text-amber-500"
          : "text-red-500";

  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200",
        variant === "original"
          ? "border bg-muted/30"
          : "border border-primary/20 bg-primary/5",
        className,
      )}
    >
      {/* Circular play button */}
      <button
        type="button"
        onClick={handlePlayPause}
        disabled={isDisabled}
        className={cn(
          "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-200",
          variant === "original"
            ? "bg-muted-foreground/20 text-foreground hover:bg-muted-foreground/30"
            : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
          isDisabled && "cursor-not-allowed opacity-50",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3.5" fill="currentColor" />
        ) : (
          <Play className="size-3.5 translate-x-0.5" fill="currentColor" />
        )}
      </button>

      {/* Progress section */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              variant === "original"
                ? "bg-muted-foreground/50"
                : "bg-primary shadow-sm",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Score display */}
      {score !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex shrink-0 cursor-help items-baseline gap-0.5 font-semibold tabular-nums",
                scoreColor,
              )}
            >
              <span className="text-2xl">{score.toFixed(1)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span>Quality Score (MOS)</span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground text-sm">--</span>
      )}

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
    </div>
  );
}

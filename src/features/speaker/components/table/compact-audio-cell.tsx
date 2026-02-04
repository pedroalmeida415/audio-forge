"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type AudioState = "idle" | "loading" | "ready" | "error";

interface CompactAudioCellProps {
  audioState: AudioState;
  audioUrl: string | null;
  onLoadAudio: () => Promise<void>;
  duration: number;
  variant: "original" | "processed";
}

export function CompactAudioCell({
  audioState,
  audioUrl,
  onLoadAudio,
  duration: expectedDuration,
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

  return (
    <div className="flex items-center gap-2">
      {/* Play/Pause button */}
      <Button
        variant="secondary"
        size="icon"
        onClick={handlePlayPause}
        disabled={isDisabled}
        className={cn(
          "size-8 shrink-0 rounded-full",
          variant === "processed" &&
            "bg-primary/10 text-primary hover:bg-primary/20",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3" fill="currentColor" />
        ) : (
          <Play className="size-3" fill="currentColor" />
        )}
      </Button>

      {/* Progress bar */}
      <div className="flex min-w-0 flex-1 items-center">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              variant === "original" ? "bg-muted-foreground/50" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

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

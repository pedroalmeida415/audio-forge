"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

type AudioState = "idle" | "loading" | "ready" | "error";

interface AudioPlayerProps {
  label: string;
  audioState: AudioState;
  audioUrl: string | null;
  onLoadAudio: () => Promise<void>;
  duration?: number;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  label,
  audioState,
  audioUrl,
  onLoadAudio,
  duration: expectedDuration,
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

  const handleSeek = useCallback((values: number[]) => {
    const audio = audioRef.current;
    if (!audio || !values[0]) return;
    audio.currentTime = values[0];
    setCurrentTime(values[0]);
  }, []);

  const isLoading = audioState === "loading";
  const isDisabled = audioState === "error";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handlePlayPause}
          disabled={isDisabled}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={0.1}
            onValueChange={handleSeek}
            disabled={audioState !== "ready"}
            className="w-full"
          />
        </div>

        <span className="w-10 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
    </div>
  );
}

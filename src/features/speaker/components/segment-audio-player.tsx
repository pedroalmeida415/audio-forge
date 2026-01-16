"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";

interface SegmentAudioPlayerProps {
  storageKey: string;
  startMs: number;
  endMs: number;
  label: string;
}

/**
 * Segment audio player with lazy loading.
 *
 * On first play:
 * 1. Fetches audio slice from media-proxy endpoint
 * 2. Creates blob URL from response
 * 3. Sets blob URL as audio src
 *
 * The blob URL is revoked on unmount to prevent memory leaks.
 */
export function SegmentAudioPlayer({
  storageKey,
  startMs,
  endMs,
  label: _label,
}: SegmentAudioPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Calculate duration from start/end times
  const durationMs = endMs - startMs;

  // Format duration as mm:ss.ms
  const formatDuration = (ms: number): string => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
  };

  // Fetch audio blob from media-proxy
  const fetchAudio = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        storageKey,
        startMs: startMs.toString(),
        endMs: endMs.toString(),
      });

      const response = await fetch(`/api/media-proxy?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Store ref for cleanup
      blobUrlRef.current = url;
      setBlobUrl(url);
      setHasLoaded(true);

      return url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load audio";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [storageKey, startMs, endMs]);

  // Handle play button click
  const handlePlayClick = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // If already playing, pause
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // If not loaded yet, fetch the audio first
    if (!hasLoaded) {
      const url = await fetchAudio();
      if (!url) return;

      // Wait for audio to be ready
      audio.src = url;
      await audio.load();
    }

    // Play the audio
    try {
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Failed to play audio:", err);
      setError("Failed to play audio");
    }
  }, [hasLoaded, isPlaying, fetchAudio]);

  // Handle audio end
  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Handle audio pause
  const handleAudioPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Handle audio play
  const handleAudioPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Play/Pause button */}
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handlePlayClick}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="h-7 w-7"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Duration label */}
      <span className="font-mono text-muted-foreground text-xs">
        {formatDuration(durationMs)}
      </span>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={blobUrl ?? undefined}
        onEnded={handleAudioEnded}
        onPause={handleAudioPause}
        onPlay={handleAudioPlay}
        preload="none"
      />

      {/* Error indicator */}
      {error && (
        <span className="text-destructive text-xs" title={error}>
          Error
        </span>
      )}
    </div>
  );
}

"use client";

import { Loader2, Pause, Play, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

interface ClipAudioPlayerProps {
  clipId: string;
  storageKey: string;
  mosScore: number | null;
  isDenoised: boolean;
  hasOverlapRemoved: boolean;
}

/**
 * Cached pre-signed URL state (per clip).
 */
interface CachedPresignedUrl {
  url: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Clip audio player with pre-signed URL caching.
 *
 * On first play:
 * 1. Requests pre-signed URL from tRPC endpoint
 * 2. Caches URL with expiration timestamp
 * 3. Sets pre-signed URL as audio src
 *
 * On subsequent plays:
 * - Checks if cached URL is expired (with 1 min buffer)
 * - Re-fetches if expired, otherwise uses cached URL
 */
export function ClipAudioPlayer({
  clipId,
  storageKey: _storageKey,
  mosScore,
  isDenoised,
  hasOverlapRemoved,
}: ClipAudioPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<CachedPresignedUrl | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  // tRPC query for getting pre-signed URL (manual fetch, not auto)
  const getPresignedUrl = api.speaker.getClipPresignedUrl.useMutation();

  /**
   * Check if the cached URL is still valid.
   * We add a 1 minute buffer to avoid edge cases where URL expires during playback.
   */
  const isCachedUrlValid = useCallback((): boolean => {
    if (!cachedUrl) return false;
    // Check if URL expires in more than 1 minute
    const bufferMs = 60 * 1000; // 1 minute buffer
    return cachedUrl.expiresAt > Date.now() + bufferMs;
  }, [cachedUrl]);

  /**
   * Fetch a new pre-signed URL from the server.
   */
  const fetchPresignedUrl = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getPresignedUrl.mutateAsync({ clipId });

      // Cache the URL with expiration
      setCachedUrl({
        url: result.url,
        expiresAt: result.expiresAt,
      });

      return result.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get audio URL";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [clipId, getPresignedUrl]);

  /**
   * Get the audio URL, either from cache or by fetching a new one.
   */
  const getAudioUrl = useCallback(async (): Promise<string | null> => {
    // If we have a valid cached URL, use it
    if (isCachedUrlValid() && cachedUrl) {
      return cachedUrl.url;
    }

    // Otherwise, fetch a new URL
    return fetchPresignedUrl();
  }, [isCachedUrlValid, cachedUrl, fetchPresignedUrl]);

  /**
   * Handle play button click.
   */
  const handlePlayClick = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // If already playing, pause
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Get the audio URL (from cache or fetch new one)
    const url = await getAudioUrl();
    if (!url) return;

    // Update audio src if needed
    if (audio.src !== url) {
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
  }, [isPlaying, getAudioUrl]);

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

      {/* Badges */}
      <div className="flex items-center gap-1">
        {/* MOS score badge */}
        {mosScore !== null && (
          <Badge variant="secondary" className="text-xs">
            MOS: {mosScore.toFixed(1)}
          </Badge>
        )}

        {/* Denoised badge */}
        {isDenoised && (
          <Badge variant="accent" className="text-xs">
            <Sparkles className="h-3 w-3" />
            Denoised
          </Badge>
        )}

        {/* Overlap removed badge */}
        {hasOverlapRemoved && (
          <Badge variant="success" className="text-xs">
            <Volume2 className="h-3 w-3" />
            Clean
          </Badge>
        )}
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
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

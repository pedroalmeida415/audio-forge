"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "~/trpc/react";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

interface UseClipPlayerReturn {
  // State
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  error: string | null;
  activeClipId: string | null;

  // Actions
  playClip: (clipId: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

/**
 * Hook for playing clips using either direct URLs (for exported clips)
 * or the media proxy (for virtual clips).
 *
 * Handles fetching playback info, loading audio, and managing playback state.
 */
export function useClipPlayer(): UseClipPlayerReturn {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // tRPC query for getting playback info
  const utils = api.useUtils();

  // Cleanup function
  const cleanup = useCallback(() => {
    // Cancel animation frame
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Cleanup audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.remove();
      audioRef.current = null;
    }

    // Revoke object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Time update RAF loop
  const startTimeUpdates = useCallback(() => {
    const updateTime = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafIdRef.current = requestAnimationFrame(updateTime);
    };
    rafIdRef.current = requestAnimationFrame(updateTime);
  }, []);

  const stopTimeUpdates = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // Play a clip by ID
  const playClip = useCallback(
    async (clipId: string) => {
      try {
        // Cleanup previous playback
        cleanup();
        setError(null);
        setPlaybackState("loading");
        setActiveClipId(clipId);
        setCurrentTime(0);

        // Get playback info from server
        const playbackInfo = await utils.clips.getClipPlaybackInfo.fetch({
          clipId,
        });

        // Determine audio source
        let audioUrl: string;

        if (playbackInfo.type === "direct") {
          // Use direct URL for exported clips
          audioUrl = playbackInfo.url;
        } else {
          // Build media proxy URL for virtual clips
          const params = new URLSearchParams({
            sessionId: playbackInfo.sessionId,
            start: String(Math.floor(playbackInfo.startTime * 1_000_000)),
            end: String(Math.floor(playbackInfo.endTime * 1_000_000)),
            codec: "aac",
            format: "mp4",
          });
          audioUrl = `/api/media-proxy?${params.toString()}`;
        }

        // Create and configure audio element
        const audio = new Audio();
        audioRef.current = audio;

        // Set up event listeners
        const handleLoadedMetadata = () => {
          setDuration(audio.duration);
        };

        const handleCanPlay = () => {
          setPlaybackState("playing");
          audio.play().catch((err) => {
            console.error("Failed to play audio:", err);
            setError("Failed to play audio");
            setPlaybackState("error");
          });
        };

        const handlePlay = () => {
          setPlaybackState("playing");
          startTimeUpdates();
        };

        const handlePause = () => {
          setPlaybackState("paused");
          stopTimeUpdates();
        };

        const handleEnded = () => {
          setPlaybackState("idle");
          setCurrentTime(0);
          setActiveClipId(null);
          stopTimeUpdates();
        };

        const handleError = () => {
          setError("Failed to load audio");
          setPlaybackState("error");
          stopTimeUpdates();
        };

        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);

        // Start loading
        audio.preload = "auto";
        audio.src = audioUrl;
        audio.load();
      } catch (err) {
        console.error("Failed to play clip:", err);
        setError(err instanceof Error ? err.message : "Failed to play clip");
        setPlaybackState("error");
        setActiveClipId(null);
      }
    },
    [
      cleanup,
      utils.clips.getClipPlaybackInfo,
      startTimeUpdates,
      stopTimeUpdates,
    ],
  );

  // Pause playback
  const pause = useCallback(() => {
    if (audioRef.current && playbackState === "playing") {
      audioRef.current.pause();
    }
  }, [playbackState]);

  // Resume playback
  const resume = useCallback(() => {
    if (audioRef.current && playbackState === "paused") {
      audioRef.current.play().catch((err) => {
        console.error("Failed to resume:", err);
        setError("Failed to resume playback");
      });
    }
  }, [playbackState]);

  // Stop playback completely
  const stop = useCallback(() => {
    cleanup();
    setPlaybackState("idle");
    setCurrentTime(0);
    setDuration(0);
    setActiveClipId(null);
    setError(null);
  }, [cleanup]);

  // Seek to a specific time
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return {
    playbackState,
    currentTime,
    duration,
    error,
    activeClipId,
    playClip,
    pause,
    resume,
    stop,
    seek,
  };
}

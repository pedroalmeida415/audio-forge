"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioPlayerOptions {
  url: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

export function useAudioPlayer({ url }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    isLoading: true,
    error: null,
  });

  // Initialize audio element only once
  useEffect(() => {
    if (isInitializedRef.current || !url) return;
    isInitializedRef.current = true;

    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setState((s) => ({
        ...s,
        duration: audio.duration,
        isLoading: false,
      }));
    };

    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
      segmentEndTimeRef.current = null;
    };

    const handleError = () => {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: "Failed to load audio",
      }));
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    audio.src = url;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [url]);

  // Use requestAnimationFrame for smooth playhead updates during playback
  useEffect(() => {
    if (!state.isPlaying) return;

    const updateTime = () => {
      const audio = audioRef.current;
      if (!audio) return;

      // Check segment end
      if (
        segmentEndTimeRef.current !== null &&
        audio.currentTime >= segmentEndTimeRef.current
      ) {
        audio.pause();
        segmentEndTimeRef.current = null;
        return;
      }

      setState((s) => ({ ...s, currentTime: audio.currentTime }));
      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    animationFrameRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isPlaying]);

  const play = useCallback(() => {
    segmentEndTimeRef.current = null;
    audioRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    segmentEndTimeRef.current = null;
    audioRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
      setState((s) => ({ ...s, playbackRate: rate }));
    }
  }, []);

  const playSegment = useCallback((start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    segmentEndTimeRef.current = end;
    audio.currentTime = start;
    audio.play();
  }, []);

  const stopSegmentPlayback = useCallback(() => {
    segmentEndTimeRef.current = null;
  }, []);

  return {
    ...state,
    play,
    pause,
    togglePlayback,
    seek,
    setPlaybackRate,
    playSegment,
    stopSegmentPlayback,
  };
}

export type AudioPlayer = ReturnType<typeof useAudioPlayer>;

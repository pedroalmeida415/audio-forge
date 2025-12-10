"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioPlayerOptions {
  buffer: ArrayBuffer;
}

interface AudioPlayerState {
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

// Subscription-based current time store for high-frequency updates without React re-renders
type TimeSubscriber = (time: number) => void;

function createTimeStore() {
  let currentTime = 0;
  const subscribers = new Set<TimeSubscriber>();

  return {
    getTime: () => currentTime,
    setTime: (time: number) => {
      currentTime = time;
      for (const fn of subscribers) {
        fn(time);
      }
    },
    subscribe: (fn: TimeSubscriber) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}

export function useAudioPlayer({ buffer }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Time store for subscription-based updates (bypasses React render cycle)
  const timeStoreRef = useRef(createTimeStore());

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    duration: 0,
    playbackRate: 1,
    isLoading: true,
    error: null,
  });

  // Initialize audio element only once
  useEffect(() => {
    if (isInitializedRef.current || !buffer) return;
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
      setState((s) => ({ ...s, isPlaying: false }));
      timeStoreRef.current.setTime(0);
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

    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
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
      URL.revokeObjectURL(url);
      audio.src = "";
      audio.remove();
      audioRef.current = null;
    };
  }, [buffer]);

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

      // Update time store (triggers subscribers, not React re-render)
      timeStoreRef.current.setTime(audio.currentTime);
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
      timeStoreRef.current.setTime(audio.currentTime);
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

  // Subscribe to time updates for direct DOM manipulation (bypasses React)
  const subscribeToTime = useCallback((callback: TimeSubscriber) => {
    return timeStoreRef.current.subscribe(callback);
  }, []);

  // Get current time (for initial render, not for animation)
  const getTime = useCallback(() => {
    return timeStoreRef.current.getTime();
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
    subscribeToTime,
    getTime,
  };
}

export type AudioPlayer = ReturnType<typeof useAudioPlayer>;

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ClippingWorkspaceStoreApi } from "./clipping-workspace-store";

/**
 * Hook that manages audio element refs and connects to the store.
 * Handles Web Audio API lifecycle, event listeners, and RAF loop.
 *
 * Must be rendered within ClippingWorkspaceStoreProvider.
 */
export function useAudioRefs(store: ClippingWorkspaceStoreApi) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Get buffer from store
  const audioDataBuffer = store.getState().audioDataBuffer;

  // Initialize audio element only once
  useEffect(() => {
    if (isInitializedRef.current || !audioDataBuffer) return;
    isInitializedRef.current = true;

    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      store.getState().setDuration(audio.duration);
      store.getState().setIsLoading(false);
    };

    const handleEnded = () => {
      store.getState().setIsPlaying(false);
      store.getState().setCurrentTime(0);
      segmentEndTimeRef.current = null;
    };

    const handleError = () => {
      store.getState().setIsLoading(false);
      store.getState().setError("Failed to load audio");
    };

    const handlePlay = () => {
      store.getState().setIsPlaying(true);
    };

    const handlePause = () => {
      store.getState().setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    const blob = new Blob([audioDataBuffer], { type: "audio/wav" });
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
  }, [audioDataBuffer, store]);

  // RAF loop for smooth playhead updates during playback
  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state.isPlaying,
      (isPlaying) => {
        if (!isPlaying) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          return;
        }

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

          // Update time in store (triggers primitive selector subscribers)
          store.getState().setCurrentTime(audio.currentTime);
          animationFrameRef.current = requestAnimationFrame(updateTime);
        };

        animationFrameRef.current = requestAnimationFrame(updateTime);
      },
      { fireImmediately: true },
    );

    return () => {
      unsubscribe();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [store]);

  // Actions
  const play = useCallback(() => {
    segmentEndTimeRef.current = null;
    audioRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    segmentEndTimeRef.current = null;
    audioRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(() => {
    const isPlaying = store.getState().isPlaying;
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [store, play, pause]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
        store.getState().setCurrentTime(audio.currentTime);
      }
    },
    [store],
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = rate;
        store.getState().setPlaybackRate(rate);
      }
    },
    [store],
  );

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
    play,
    pause,
    togglePlayback,
    seek,
    setPlaybackRate,
    playSegment,
    stopSegmentPlayback,
  };
}

export type AudioActions = ReturnType<typeof useAudioRefs>;

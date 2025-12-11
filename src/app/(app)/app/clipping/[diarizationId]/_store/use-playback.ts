"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ClippingWorkspaceStoreApi } from "./clipping-workspace-store";
import { TIMELINE_CONSTANTS } from "./clipping-workspace-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

/**
 * Helper to calculate pixels per second from store state.
 */
function getPixelsPerSecond(zoomLevel: number, containerWidth: number): number {
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

/**
 * Combined hook that manages audio playback and timeline scrolling.
 * Handles Web Audio API lifecycle, event listeners, RAF loop, and auto-scrolling.
 *
 * Must be rendered within ClippingWorkspaceStoreProvider.
 */
export function usePlayback(store: ClippingWorkspaceStoreApi) {
  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Timeline refs
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Get buffer from store
  const audioDataBuffer = store.getState().audioDataBuffer;

  // ============================================================================
  // Timeline utilities
  // ============================================================================

  // Convert time to pixel position
  const timeToPixels = useCallback(
    (time: number): number => {
      const { zoomLevel, containerWidth } = store.getState();
      return time * getPixelsPerSecond(zoomLevel, containerWidth);
    },
    [store],
  );

  // Convert pixel position to time
  const pixelsToTime = useCallback(
    (pixels: number): number => {
      const { zoomLevel, containerWidth } = store.getState();
      const pps = getPixelsPerSecond(zoomLevel, containerWidth);
      if (pps <= 0) return 0;
      return pixels / pps;
    },
    [store],
  );

  // Scroll to a specific time position
  const scrollToTime = useCallback(
    (time: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { containerWidth } = store.getState();
      const targetX = timeToPixels(time);
      // Center the time in the viewport
      const scrollLeft = targetX - containerWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior,
      });
    },
    [store, timeToPixels],
  );

  // ============================================================================
  // Audio initialization
  // ============================================================================

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

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    // Track the target visible area we're scrolling to
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;

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

        // Initialize target boundaries
        const container = scrollContainerRef.current;
        if (container) {
          const { containerWidth } = store.getState();
          targetVisibleLeft = container.scrollLeft;
          targetVisibleRight = targetVisibleLeft + containerWidth;
        }

        const updateTime = () => {
          const audio = audioRef.current;
          const container = scrollContainerRef.current;
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

          const currentTime = audio.currentTime;

          // Update time in store (triggers primitive selector subscribers)
          store.getState().setCurrentTime(currentTime);

          // Auto-scroll: keep playhead visible, always land on left side
          if (container) {
            const { zoomLevel, containerWidth } = store.getState();
            const pps = getPixelsPerSecond(zoomLevel, containerWidth);
            const timeX = currentTime * pps;
            const padding = containerWidth * 0.1;

            // Check against TARGET boundaries (where we're scrolling to), not current scroll position
            const pastRightEdge = timeX > targetVisibleRight - padding;
            const pastLeftEdge = timeX < targetVisibleLeft + padding;

            if (pastRightEdge || pastLeftEdge) {
              // Always position playhead on the left side with padding
              const newScrollLeft = Math.max(0, timeX - padding);
              container.scrollTo({
                left: newScrollLeft,
                behavior: "smooth",
              });
              // Update target boundaries to where we're scrolling
              targetVisibleLeft = newScrollLeft;
              targetVisibleRight = newScrollLeft + containerWidth;
            }
          }

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

  // ============================================================================
  // Audio actions
  // ============================================================================

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
    // Timeline refs and utilities
    scrollContainerRef,
    timeToPixels,
    pixelsToTime,
    scrollToTime,

    // Audio actions
    play,
    pause,
    togglePlayback,
    seek,
    setPlaybackRate,
    playSegment,
    stopSegmentPlayback,
  };
}

export type PlaybackActions = ReturnType<typeof usePlayback>;

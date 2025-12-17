"use client";

import { createContext, type ReactNode, use, useEffect, useRef } from "react";
import { useClippingStore } from "../_context/store.context";
import { TIMELINE_CONSTANTS } from "../_store/clipping-workspace-store";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

/**
 * Helper to calculate pixels per second from store state.
 */
function getPixelsPerSecond(zoomLevel: number, containerWidth: number): number {
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

function usePlaybackState(audioDataBuffer: ArrayBuffer) {
  const store = useClippingStore();

  // Audio refs
  const audioDataBufferRef = useRef<ArrayBuffer>(audioDataBuffer);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // Track which buffer was initialized to handle re-initialization on navigation

  // Timeline refs
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // ============================================================================
  // Timeline utilities
  // ============================================================================

  // Convert time to pixel position
  const timeToPixels = (time: number): number => {
    const { zoomLevel, containerWidth } = store.getState().timeline;
    return time * getPixelsPerSecond(zoomLevel, containerWidth);
  };

  // Convert pixel position to time
  const pixelsToTime = (pixels: number): number => {
    const { zoomLevel, containerWidth } = store.getState().timeline;
    const pps = getPixelsPerSecond(zoomLevel, containerWidth);
    if (pps <= 0) return 0;
    return pixels / pps;
  };

  // Scroll to a specific time position
  const scrollToTime = (time: number, behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { containerWidth } = store.getState().timeline;
    const targetX = timeToPixels(time);
    // Center the time in the viewport
    const scrollLeft = targetX - containerWidth / 2;

    container.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior,
    });
  };

  // ============================================================================
  // Audio initialization
  // ============================================================================

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      store.getState().playback.setDuration(audio.duration);
      store.getState().playback.setIsLoading(false);
    };

    const handleEnded = () => {
      store.getState().playback.setIsPlaying(false);
      store.getState().playback.setCurrentTime(0);
      segmentEndTimeRef.current = null;
    };

    const handleError = () => {
      store.getState().playback.setIsLoading(false);
      store.getState().playback.setError("Failed to load audio");
    };

    const handlePlay = () => {
      store.getState().playback.setIsPlaying(true);
    };

    const handlePause = () => {
      store.getState().playback.setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    const blob = new Blob([audioDataBufferRef.current], { type: "audio/wav" });
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
      // Reset the initialized buffer ref so we can reinitialize on next mount
    };
  }, [store]);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    // Track the target visible area we're scrolling to
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;

    const unsubscribe = store.subscribe(
      (state) => state.playback.isPlaying,
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
          const { containerWidth } = store.getState().timeline;
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
          store.getState().playback.setCurrentTime(currentTime);

          // Auto-scroll: keep playhead visible, always land on left side
          if (container) {
            const { zoomLevel, containerWidth } = store.getState().timeline;
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

  const play = () => {
    segmentEndTimeRef.current = null;
    audioRef.current?.play();
  };

  const pause = () => {
    segmentEndTimeRef.current = null;
    audioRef.current?.pause();
  };

  const togglePlayback = () => {
    const isPlaying = store.getState().playback.isPlaying;
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
      store.getState().playback.setCurrentTime(audio.currentTime);
    }
  };

  const setPlaybackRate = (rate: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
      store.getState().playback.setPlaybackRate(rate);
    }
  };

  const playSegment = (start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    segmentEndTimeRef.current = end;
    audio.currentTime = start;
    audio.play();
  };

  // Combined handlers
  const handleSegmentSelect = (segmentId: string) => {
    store.getState().segments.selectSegment(segmentId);
    const segment = store.getState().segments.segmentsById[segmentId];
    if (segment) {
      scrollToTime(segment.start);
    }
  };

  const handleTimelineSegmentClick = (segmentId: string) => {
    store.getState().segments.selectSegment(segmentId);
  };

  const handleSegmentPlay = (segmentId: string) => {
    const segment = store.getState().segments.segmentsById[segmentId];
    if (segment) {
      playSegment(segment.start, segment.end);
      scrollToTime(segment.start);
    }
  };

  const handleNavigateSegment = (direction: "next" | "prev") => {
    const segmentsState = store.getState().segments;
    const { selectedSegmentId, selectedSpeaker, segmentsById } = segmentsState;
    const segments = Object.values(segmentsById);

    // Filter segments by speaker
    const filteredSegments = selectedSpeaker
      ? segments.filter((s) => s.speaker === selectedSpeaker)
      : segments;

    if (!selectedSegmentId) {
      const nextSegment =
        direction === "next" ? filteredSegments[0] : undefined;
      if (nextSegment) {
        segmentsState.selectSegment(nextSegment.id);
        scrollToTime(nextSegment.start);
      }
      return;
    }

    const currentIndex = filteredSegments.findIndex(
      (s) => s.id === selectedSegmentId,
    );
    if (currentIndex === -1) return;

    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    const segment = filteredSegments[newIndex];

    if (segment) {
      segmentsState.selectSegment(segment.id);
      scrollToTime(segment.start);
    }
  };

  const handleScrubberDrag = (clientX: number, rect: DOMRect) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const relativeX = clientX - rect.left + scrollLeft;
    const time = pixelsToTime(relativeX);
    const duration = store.getState().playback.duration;
    const clampedTime = Math.max(0, Math.min(time, duration));
    seek(clampedTime);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const relativeX = e.clientX - rect.left + scrollLeft;
    const time = pixelsToTime(relativeX);
    const duration = store.getState().playback.duration;
    const clampedTime = Math.max(0, Math.min(time, duration));
    seek(clampedTime);
  };

  return {
    // Timeline refs and utilities
    scrollContainerRef,
    audioDataBufferRef,
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

    // Combined handlers
    handleSegmentSelect,
    handleTimelineSegmentClick,
    handleSegmentPlay,
    handleNavigateSegment,
    handleScrubberDrag,
    handleTimelineClick,
  };
}

// ============================================================================
// Context
// ===============================================================
const PlaybackContext = createContext<ReturnType<
  typeof usePlaybackState
> | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface PlaybackProviderProps {
  children: ReactNode;
  initialData: {
    audioDataBuffer: ArrayBuffer;
  };
}

export function PlaybackProvider({
  initialData,
  children,
}: PlaybackProviderProps) {
  const { audioDataBuffer } = initialData;

  // Initialize ref hooks
  const playback = usePlaybackState(audioDataBuffer);

  return (
    <PlaybackContext.Provider value={playback}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = use(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used within PlaybackProvider");
  }
  return context;
}

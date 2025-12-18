"use client";

import { observe } from "@legendapp/state";
import { createContext, type ReactNode, use, useEffect, useRef } from "react";
import { useClippingStore } from "../_context/store.context";
import { TIMELINE_CONSTANTS } from "../_store/clipping-store";

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
  const $store = useClippingStore();

  // Audio refs
  const audioDataBufferRef = useRef<ArrayBuffer>(audioDataBuffer);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Timeline refs
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // ============================================================================
  // Timeline utilities
  // ============================================================================

  // Convert time to pixel position
  const timeToPixels = (time: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    return time * getPixelsPerSecond(zoomLevel, containerWidth);
  };

  // Convert pixel position to time
  const pixelsToTime = (pixels: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    const pps = getPixelsPerSecond(zoomLevel, containerWidth);
    if (pps <= 0) return 0;
    return pixels / pps;
  };

  // Scroll to a specific time position
  const scrollToTime = (time: number, behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerWidth = $store.timeline.containerWidth.peek();
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
      $store.playback.duration.set(audio.duration);
      $store.playback.isLoading.set(false);
    };

    const handleEnded = () => {
      $store.playback.isPlaying.set(false);
      $store.playback.currentTime.set(0);
      segmentEndTimeRef.current = null;
    };

    const handleError = () => {
      $store.playback.isLoading.set(false);
      $store.playback.error.set("Failed to load audio");
    };

    const handlePlay = () => {
      $store.playback.isPlaying.set(true);
    };

    const handlePause = () => {
      $store.playback.isPlaying.set(false);
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
    };
  }, [$store]);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    // Track the target visible area we're scrolling to
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;

    // observe() automatically tracks dependencies and runs when they change
    const dispose = observe(() => {
      const isPlaying = $store.playback.isPlaying.get();

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
        const containerWidth = $store.timeline.containerWidth.peek();
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

        // Update time in store
        $store.playback.currentTime.set(currentTime);

        // Auto-scroll: keep playhead visible, always land on left side
        if (container) {
          const zoomLevel = $store.timeline.zoomLevel.peek();
          const containerWidth = $store.timeline.containerWidth.peek();
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
    });

    return () => {
      dispose();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [$store]);

  // ============================================================================
  // Scroll timeline when active segment changes
  // ============================================================================

  useEffect(() => {
    const dispose = observe(() => {
      const activeSegmentId = $store.selection.activeSegmentId.get();
      if (!activeSegmentId) return;

      // Use peek() to avoid tracking these - we only want to react to activeSegmentId
      const $segment = $store.segmentsById[activeSegmentId];
      if (!$segment) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      // Calculate segment center and scroll to it
      const segment = $segment.peek();
      const segmentCenter = (segment.start + segment.end) / 2;
      const zoomLevel = $store.timeline.zoomLevel.peek();
      const containerWidth = $store.timeline.containerWidth.peek();
      const pps = getPixelsPerSecond(zoomLevel, containerWidth);
      const targetX = segmentCenter * pps;
      const scrollLeft = targetX - containerWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: "smooth",
      });
    });

    return dispose;
  }, [$store]);

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
    const isPlaying = $store.playback.isPlaying.peek();
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
      $store.playback.currentTime.set(audio.currentTime);
    }
  };

  const setPlaybackRate = (rate: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
      $store.playback.playbackRate.set(rate);
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
    $store.selection.selectSegment(segmentId);
    const $segment = $store.segmentsById[segmentId];
    if ($segment) {
      scrollToTime($segment.start.peek());
    }
  };

  const handleTimelineSegmentClick = (segmentId: string) => {
    $store.selection.setActiveSegment(segmentId);
  };

  const handleSegmentPlay = (segmentId: string) => {
    const $segment = $store.segmentsById[segmentId];
    if ($segment) {
      const segment = $segment.peek();
      playSegment(segment.start, segment.end);
      scrollToTime(segment.start);
    }
  };

  const handleNavigateSegment = (direction: "next" | "prev") => {
    const selectedSegmentId = $store.selection.selectedSegmentId.peek();
    const selectedSpeaker = $store.selection.selectedSpeaker.peek();
    const segments = $store.segments.peek();

    // Filter segments by speaker and non-deleted
    const filteredSegments = selectedSpeaker
      ? segments.filter((s) => s.speaker === selectedSpeaker && !s.isDeleted)
      : segments.filter((s) => !s.isDeleted);

    // Sort by start time
    filteredSegments.sort((a, b) => a.start - b.start);

    if (!selectedSegmentId) {
      const nextSegment =
        direction === "next" ? filteredSegments[0] : undefined;
      if (nextSegment) {
        $store.selection.selectSegment(nextSegment.id);
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
      $store.selection.selectSegment(segment.id);
      scrollToTime(segment.start);
    }
  };

  const handleScrubberDrag = (clientX: number, rect: DOMRect) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const relativeX = clientX - rect.left + scrollLeft;
    const time = pixelsToTime(relativeX);
    const duration = $store.playback.duration.peek();
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
    const duration = $store.playback.duration.peek();
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

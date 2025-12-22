import { observe } from "@legendapp/state";
import { useObserve } from "@legendapp/state/react";
import { useEffect } from "react";
import {
  type $ClippingStore,
  TIMELINE_CONSTANTS,
} from "../_store/clipping-store";
import type { PlaybackRefs } from "../_store/slices/playback";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

/**
 * Hook that connects the audio element and RAF loop to the store.
 * This is a minimal connector - all state and actions live in the store.
 */
export function usePlayback($store: $ClippingStore) {
  // ============================================================================
  // Audio initialization
  // ============================================================================

  useEffect(() => {
    const { audioRef } = $store.playback.refs.peek() as PlaybackRefs;
    const audio = new Audio();
    audio.preload = "metadata";

    // Store the audio element in refs
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      $store.playback.duration.set(audio.duration);
      $store.playback.isLoading.set(false);
    };

    const handleEnded = () => {
      $store.playback.isPlaying.set(false);
      $store.playback.currentTime.set(0);
      $store.playback.segmentEndTime.set(null);
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

    const blob = new Blob([$store.audioDataBuffer.peek()], {
      type: "audio/wav",
    });
    const url = URL.createObjectURL(blob);
    audio.src = url;

    return () => {
      const animationFrameId = $store.playback.animationFrameId.peek();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
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
  }, []);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    const { audioRef, scrollContainerRef } = $store.playback.refs.peek();

    // Track the target visible area we're scrolling to
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;

    // observe() automatically tracks dependencies and runs when they change
    const dispose = observe(() => {
      const isPlaying = $store.playback.isPlaying.get();

      if (!isPlaying) {
        const animationFrameId = $store.playback.animationFrameId.peek();
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          $store.playback.animationFrameId.set(null);
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
        const segmentEndTime = $store.playback.segmentEndTime.peek();
        if (segmentEndTime !== null && audio.currentTime >= segmentEndTime) {
          audio.pause();
          $store.playback.segmentEndTime.set(null);
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

        $store.playback.animationFrameId.set(requestAnimationFrame(updateTime));
      };

      $store.playback.animationFrameId.set(requestAnimationFrame(updateTime));
    });

    return () => {
      dispose();
      const animationFrameId = $store.playback.animationFrameId.peek();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // ============================================================================
  // Scroll timeline when active segment changes
  // ============================================================================

  useObserve(() => {
    const activeSegmentId = $store.activeSegmentId.get();
    if (!activeSegmentId) return;

    const segment = $store.segments
      .peek()
      .find((s) => s.id === activeSegmentId);
    if (!segment) return;

    const { scrollContainerRef } = $store.playback.refs.peek();
    const container = scrollContainerRef.current;
    if (!container) return;

    // Calculate segment center and scroll to it
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
}

/**
 * Helper to calculate pixels per second from store state.
 */
function getPixelsPerSecond(zoomLevel: number, containerWidth: number): number {
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

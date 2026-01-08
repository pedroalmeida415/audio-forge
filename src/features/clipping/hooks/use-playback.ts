import { observe } from "@legendapp/state";
import { useObserve } from "@legendapp/state/react";
import { useEffect } from "react";
import type { PlaybackRefs } from "~/features/clipping/store/slices/playback";
import { calculatePixelsPerSecond } from "~/features/clipping/utils/zoom-utils";
import { MSEAudioProvider } from "~/lib/media-proxy/mse-audio-provider";
import { useClippingStore } from "../context/store.context";

/**
 * Hook that connects the MSE audio provider to the store.
 * Creates the provider in useEffect and wires up event listeners + RAF loop.
 */
export function usePlayback() {
  const $store = useClippingStore();
  // ============================================================================
  // Create MSE provider and wire up to store
  // ============================================================================

  useEffect(() => {
    const storageKey = $store.storageKey.peek();
    const duration = $store.playback.duration.peek();
    const { audioRef } = $store.playback.refs.peek() as PlaybackRefs;

    const provider = new MSEAudioProvider({
      storageKey,
      duration,
      sliceSize: 15,
    });

    const audioElement = provider.audioElement;

    // Set audioRef for store actions (play, pause, seek, etc.)
    audioRef.current = audioElement;

    // Mark as ready (duration already set via initial data)
    $store.playback.isLoading.set(false);

    const handleEnded = () => {
      $store.playback.isPlaying.set(false);
      $store.playback.currentTime.set(0);
      $store.playback.segmentEndTime.set(null);
    };

    const handleError = () => {
      $store.playback.error.set("Failed to load audio");
    };

    const handlePlay = () => {
      $store.playback.isPlaying.set(true);
    };

    const handlePause = () => {
      $store.playback.isPlaying.set(false);
    };

    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);

    return () => {
      const animationFrameId = $store.playback.animationFrameId.peek();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioRef.current = null;
      provider.detach();
    };
  }, []);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    // Track the target visible area we're scrolling to
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;

    const dispose = observe(() => {
      const isPlaying = $store.playback.isPlaying.get();
      const { audioRef } = $store.playback.refs.peek() as PlaybackRefs;
      const audioElement = audioRef.current;

      if (!isPlaying || !audioElement) {
        const animationFrameId = $store.playback.animationFrameId.peek();
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          $store.playback.animationFrameId.set(null);
        }
        return;
      }

      // Initialize target boundaries from store's scrollOffset
      const containerWidth = $store.timeline.containerWidth.peek();
      targetVisibleLeft = $store.timeline.scrollOffset.peek();
      targetVisibleRight = targetVisibleLeft + containerWidth;

      const updateTime = () => {
        // Check segment end
        const segmentEndTime = $store.playback.segmentEndTime.peek();
        if (
          segmentEndTime !== null &&
          audioElement.currentTime >= segmentEndTime
        ) {
          audioElement.pause();
          $store.playback.segmentEndTime.set(null);
          return;
        }

        const currentTime = audioElement.currentTime;

        // Update time in store
        $store.playback.currentTime.set(currentTime);

        // Auto-scroll: keep playhead visible, always land on left side
        const zoomLevel = $store.timeline.zoomLevel.peek();
        const duration = $store.playback.duration.peek();
        const containerWidth = $store.timeline.containerWidth.peek();
        const pps = calculatePixelsPerSecond(
          zoomLevel,
          duration,
          containerWidth,
        );
        const timeX = currentTime * pps;
        const padding = containerWidth * 0.1;

        // Check against TARGET boundaries (where we're scrolling to), not current scroll position
        const pastRightEdge = timeX > targetVisibleRight - padding;
        const pastLeftEdge = timeX < targetVisibleLeft + padding;

        if (pastRightEdge || pastLeftEdge) {
          // Always position playhead on the left side with padding
          const newScrollOffset = Math.max(0, timeX - padding);
          $store.timeline.setScrollOffset(newScrollOffset);
          // Update target boundaries to where we're scrolling
          targetVisibleLeft = newScrollOffset;
          targetVisibleRight = newScrollOffset + containerWidth;
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

    // Calculate segment center and scroll to it
    const segmentCenter = (segment.startTime + segment.endTime) / 2;
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const duration = $store.playback.duration.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    const pps = calculatePixelsPerSecond(zoomLevel, duration, containerWidth);
    const targetX = segmentCenter * pps;
    const scrollOffset = targetX - containerWidth / 2;

    $store.timeline.setScrollOffset(scrollOffset);
  });
}

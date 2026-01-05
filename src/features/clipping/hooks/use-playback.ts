import { observe } from "@legendapp/state";
import { useObserve, useSelector } from "@legendapp/state/react";
import { useEffect, useRef } from "react";
import type { $ClippingStore } from "~/features/clipping/store/clipping-store";
import type { PlaybackRefs } from "~/features/clipping/store/slices/playback";
import { calculatePixelsPerSecond } from "~/features/clipping/utils/zoom-utils";
import { useMSEAudio } from "~/hooks/use-mse-audio";

/**
 * Hook that connects the audio element (via MSE) and RAF loop to the store.
 * This is a minimal connector - all state and actions live in the store.
 */
export function usePlayback($store: $ClippingStore) {
  // Get audio config from store (stable values)
  const storageKey = useSelector(() => $store.storageKey.get());
  const audioDuration = useSelector(() => $store.audioDuration.get());

  // MSE audio provider - creates and manages its own audio element
  const mseEnabled = !!storageKey && audioDuration > 0;
  const {
    audioElement,
    ensureLoaded,
    preloadAhead,
    error: mseError,
  } = useMSEAudio({
    storageKey,
    duration: audioDuration,
    sliceSize: 15,
    enabled: mseEnabled,
  });

  // Keep a ref to the latest ensureLoaded/preloadAhead functions
  const ensureLoadedRef = useRef(ensureLoaded);
  const preloadAheadRef = useRef(preloadAhead);
  useEffect(() => {
    ensureLoadedRef.current = ensureLoaded;
    preloadAheadRef.current = preloadAhead;
  }, [ensureLoaded, preloadAhead]);

  // Propagate MSE errors to store
  useEffect(() => {
    if (mseError) {
      $store.playback.error.set(mseError);
      $store.playback.isLoading.set(false);
    }
  }, [mseError]);

  // Track if we've already handled the missing duration case
  const hasSetMissingDurationError = useRef(false);

  // ============================================================================
  // Audio initialization with MSE
  // ============================================================================

  useEffect(() => {
    // If duration is missing, show error and stop loading (only once)
    if (audioDuration <= 0) {
      if (!hasSetMissingDurationError.current) {
        hasSetMissingDurationError.current = true;
        if (storageKey) {
          $store.playback.error.set(
            "Audio duration not available. File may need reprocessing.",
          );
        }
        $store.playback.isLoading.set(false);
      }
      return;
    }

    // Reset the flag if duration becomes valid
    hasSetMissingDurationError.current = false;

    // Wait for audio element to be created
    if (!audioElement) {
      return;
    }

    const { audioRef } = $store.playback.refs.peek() as PlaybackRefs;
    audioRef.current = audioElement;

    // Set duration from our known value (MSE sets MediaSource.duration)
    // We don't need to wait for loadedmetadata since we know the duration
    $store.playback.duration.set(audioDuration);
    $store.playback.isLoading.set(false);

    // Preload the first slice so playback can start immediately
    ensureLoadedRef.current(0);

    const handleLoadedMetadata = () => {
      // Update duration from audio element if it differs
      if (audioElement.duration && audioElement.duration !== audioDuration) {
        $store.playback.duration.set(audioElement.duration);
      }
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

    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);

    // If metadata already loaded, trigger handler
    if (audioElement.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      const animationFrameId = $store.playback.animationFrameId.peek();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioRef.current = null;
    };
  }, [audioElement, audioDuration, storageKey]);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    const { audioRef } = $store.playback.refs.peek();

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

      // Initialize target boundaries from store's scrollOffset
      const containerWidth = $store.timeline.containerWidth.peek();
      targetVisibleLeft = $store.timeline.scrollOffset.peek();
      targetVisibleRight = targetVisibleLeft + containerWidth;

      const updateTime = () => {
        const audio = audioRef.current;
        if (!audio) return;

        // Check segment end
        const segmentEndTime = $store.playback.segmentEndTime.peek();
        if (segmentEndTime !== null && audio.currentTime >= segmentEndTime) {
          audio.pause();
          $store.playback.segmentEndTime.set(null);
          return;
        }

        const currentTime = audio.currentTime;

        // MSE: Ensure current time is loaded and preload ahead
        ensureLoadedRef.current(currentTime);
        preloadAheadRef.current(currentTime, 2);

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

"use client";

import { useEffect } from "react";
import { effect } from "valtio-reactive";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { calculatePixelsPerSecond } from "~/features/workspace/utils/zoom-utils";
import { MSEAudioProvider } from "~/lib/media-proxy/mse-audio-provider";

interface SourceData {
  storageKey: string;
  duration: number;
}

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
}

/**
 * Hook that connects the MSE audio provider to the store.
 * Creates the provider in useEffect and wires up event listeners + RAF loop.
 *
 * @param sourceData - The audio source data (storageKey + duration). When null, the hook is a no-op.
 * @param segments - Segments array for scroll-on-active-segment-change behavior.
 */
export function usePlayback(
  sourceData: SourceData | null,
  segments: Segment[] = [],
  activeSegmentId: string | null = null,
) {
  const { store } = useWorkspaceStore();

  // ============================================================================
  // Create MSE provider and wire up to store
  // ============================================================================

  useEffect(() => {
    if (!sourceData) return;

    const { storageKey, duration } = sourceData;
    store.duration = duration;

    const provider = new MSEAudioProvider({
      storageKey,
      duration,
      sliceSize: 15,
    });

    const audioElement = provider.audioElement;

    // Set audioElement ref for store actions (play, pause, seek, etc.)
    store.refs.audioElement = audioElement;

    // Mark as ready (duration already set via sourceData)
    store.isLoading = false;

    const handleEnded = () => {
      store.isPlaying = false;
      store.currentTime = 0;
      store.segmentEndTime = null;
    };

    const handleError = () => {
      store.playbackError = "Failed to load audio";
    };

    const handlePlay = () => {
      store.isPlaying = true;
    };

    const handlePause = () => {
      store.isPlaying = false;
      // DO NOT manually sync store.currentTime to audioElement.currentTime here!
      // MSE audio elements often report a delayed currentTime.
      // Our RAF loop tracks a high-precision `expectedTime`. Overwriting it here
      // with a lagging browser time causes visual jumps backward. By doing nothing,
      // we leave the playhead exactly where the high-precision expectedTime stopped.
    };

    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);

    return () => {
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      store.refs.audioElement = null;
      provider.detach();
    };
  }, [store, sourceData?.storageKey]);

  // ============================================================================
  // RAF loop for smooth playhead updates + auto-scroll
  // ============================================================================

  useEffect(() => {
    let rafId: number | null = null;
    let targetVisibleRight = 0;
    let targetVisibleLeft = 0;
    let initialized = false;

    // Anchor times for perfectly smooth playhead extrapolation
    let playStartTime = 0;
    let audioStartTime = 0;

    const dispose = effect(() => {
      // ONLY track store.isPlaying — everything else is read inside the RAF
      // callback (asynchronous) so it won't be tracked by valtio-reactive.
      const isPlaying = store.isPlaying;

      // Cancel any existing RAF loop before potentially starting a new one
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (!isPlaying) {
        initialized = false;
        return;
      }

      const updateTime = () => {
        // refs is ref()-wrapped so not tracked by proxy
        const audioElement = store.refs.audioElement;
        if (!audioElement) return;

        // Lazy-init target boundaries and anchors on first tick
        if (!initialized) {
          targetVisibleLeft = store.scrollOffset;
          targetVisibleRight = targetVisibleLeft + store.containerWidth;
          initialized = true;

          // Capture precise anchors right when playback starts or resumes
          playStartTime = performance.now();
          audioStartTime = audioElement.currentTime;
        }

        const rawTime = audioElement.currentTime;
        const now = performance.now();

        // Extrapolate time based on real wall-clock elapsed time.
        // This is perfectly smooth and bypasses MSE's chunked 250ms time updates.
        let expectedTime =
          audioStartTime +
          ((now - playStartTime) / 1000) * audioElement.playbackRate;

        if (audioElement.readyState < 3) {
          // Buffering (HAVE_CURRENT_DATA or lower): freeze extrapolation at rawTime
          audioStartTime = rawTime;
          playStartTime = now;
          expectedTime = rawTime;
        } else if (Math.abs(expectedTime - rawTime) > 0.3) {
          // Seeked, stalled, or drifted significantly: resync anchors
          audioStartTime = rawTime;
          playStartTime = now;
          expectedTime = rawTime;
        }

        // Clamp to duration
        const timeToUse = Math.min(expectedTime, store.duration);

        // Check segment end
        const segmentEndTime = store.segmentEndTime;
        if (segmentEndTime !== null && timeToUse >= segmentEndTime) {
          audioElement.pause();
          store.segmentEndTime = null;
          return;
        }

        // Update time in store
        store.currentTime = timeToUse;

        // Auto-scroll: keep playhead visible, always land on left side
        const zoomLevel = store.zoomLevel;
        const duration = store.duration;
        const containerWidth = store.containerWidth;
        const pps = calculatePixelsPerSecond(
          zoomLevel,
          duration,
          containerWidth,
        );
        const timeX = timeToUse * pps;
        const padding = containerWidth * 0.1;

        // Check against TARGET boundaries (where we're scrolling to), not current scroll position
        const pastRightEdge = timeX > targetVisibleRight - padding;
        const pastLeftEdge = timeX < targetVisibleLeft + padding;

        if (pastRightEdge || pastLeftEdge) {
          // Always position playhead on the left side with padding
          const newScrollOffset = Math.max(0, timeX - padding);
          store.setScrollOffset(newScrollOffset);
          // Update target boundaries to where we're scrolling
          targetVisibleLeft = newScrollOffset;
          targetVisibleRight = newScrollOffset + containerWidth;
        }

        rafId = requestAnimationFrame(updateTime);
      };

      rafId = requestAnimationFrame(updateTime);
    });

    return () => {
      dispose();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [store]);

  // ============================================================================
  // Scroll timeline when active segment changes
  // ============================================================================

  useEffect(() => {
    if (!activeSegmentId) return;

    const segment = segments.find((s) => s.id === activeSegmentId);
    if (!segment) return;

    const centerTime = (segment.startTime + segment.endTime) / 2;
    store.scrollToTime(centerTime);
  }, [store, segments, activeSegmentId]);
}

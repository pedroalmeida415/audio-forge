"use client";

import { batch, type Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import type { AudioCache } from "./audio-cache";

// ============================================================================
// Types
// ============================================================================

/**
 * Segment data returned from the server with file info for streaming.
 */
export interface SpeakerSegment {
  id: string;
  speakerId: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  createdAt: Date;
  storageKey: string | null;
  fileName: string;
  sessionName: string | null;
}

/**
 * State for a segment that is currently loaded/playing.
 */
export interface PlayingSegmentState {
  segmentId: string;
  audioElement: HTMLAudioElement;
  blobUrl: string;
  progress: number; // 0-1
  status: "loading" | "playing" | "paused" | "ended" | "error";
  error?: string;
}

/**
 * Speaker info with project context.
 */
export interface SpeakerInfo {
  id: string;
  name: string;
  color: string | null;
  projectId: string;
  projectName: string;
  segmentCount: number;
}

// ============================================================================
// Store State Interface
// ============================================================================

export interface SpeakersStoreState {
  // Data
  speaker: SpeakerInfo | null;
  segments: SpeakerSegment[];

  // Playing segments state (keyed by segment ID)
  playingSegments: Record<string, PlayingSegmentState>;

  // Computed
  playingCount: () => number;
  hasPlayingSegments: () => boolean;

  // Actions
  playSegment: (segmentId: string) => Promise<void>;
  pauseSegment: (segmentId: string) => void;
  resumeSegment: (segmentId: string) => void;
  stopSegment: (segmentId: string) => void;
  stopAllSegments: () => void;

  // Internal
  _updateProgress: (segmentId: string, progress: number) => void;
  _setStatus: (
    segmentId: string,
    status: PlayingSegmentState["status"],
  ) => void;
}

export type $SpeakersStore = Observable<SpeakersStoreState>;

// ============================================================================
// Store Initial Data
// ============================================================================

export interface SpeakersStoreInitialData {
  speaker: SpeakerInfo | null;
  segments: SpeakerSegment[];
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Creates the speakers store observable.
 * Must be called from a React component (the provider).
 */
export function createSpeakersStore(
  initialData: SpeakersStoreInitialData,
  audioCache: AudioCache,
) {
  // RAF handle for progress updates
  let rafId: number | null = null;

  const $store = useObservable<SpeakersStoreState>({
    // Initial data
    speaker: initialData.speaker,
    segments: initialData.segments,
    playingSegments: {},

    // Computed values
    playingCount: () => {
      const playing = $store.playingSegments.get();
      return Object.values(playing).filter(
        (s) => s.status === "playing" || s.status === "loading",
      ).length;
    },

    hasPlayingSegments: () => {
      return $store.playingCount() > 0;
    },

    // Actions
    playSegment: async (segmentId: string) => {
      const segment = $store.segments.peek().find((s) => s.id === segmentId);
      if (!segment) return;

      if (!segment.storageKey) {
        console.error("Segment has no storage key:", segmentId);
        return;
      }

      // Check if already loaded
      const existing = $store.playingSegments[segmentId]?.peek();
      if (existing && existing.status !== "error") {
        // Already loaded, just play
        if (existing.status === "paused" || existing.status === "ended") {
          existing.audioElement.currentTime = 0;
          await existing.audioElement.play();
          $store._setStatus(segmentId, "playing");
          startProgressLoop();
        }
        return;
      }

      // Set loading state
      $store.playingSegments[segmentId]?.set({
        segmentId,
        audioElement: null as unknown as HTMLAudioElement,
        blobUrl: "",
        progress: 0,
        status: "loading",
      });

      try {
        const cached = await audioCache.getOrCreate(
          segmentId,
          segment.storageKey,
          Math.round(segment.startTime * 1000),
          Math.round(segment.endTime * 1000),
        );

        // Set up event listeners
        cached.audioElement.onended = () => {
          $store._setStatus(segmentId, "ended");
          audioCache.markStopped(segmentId);
          stopProgressLoopIfNeeded();
        };

        cached.audioElement.onerror = () => {
          $store.playingSegments[segmentId]?.assign({
            status: "error",
            error: "Failed to play audio",
          });
          audioCache.markStopped(segmentId);
          stopProgressLoopIfNeeded();
        };

        // Update state with loaded audio
        $store.playingSegments[segmentId]?.assign({
          audioElement: cached.audioElement,
          blobUrl: cached.blobUrl,
          status: "playing",
        });

        audioCache.markPlaying(segmentId);
        await cached.audioElement.play();
        startProgressLoop();
      } catch (error) {
        console.error("Failed to load segment audio:", error);
        $store.playingSegments[segmentId]?.assign({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },

    pauseSegment: (segmentId: string) => {
      const state = $store.playingSegments[segmentId]?.peek();
      if (!state || state.status !== "playing") return;

      state.audioElement.pause();
      $store._setStatus(segmentId, "paused");
      stopProgressLoopIfNeeded();
    },

    resumeSegment: (segmentId: string) => {
      const state = $store.playingSegments[segmentId]?.peek();
      if (!state || state.status !== "paused") return;

      state.audioElement.play();
      $store._setStatus(segmentId, "playing");
      startProgressLoop();
    },

    stopSegment: (segmentId: string) => {
      const state = $store.playingSegments[segmentId]?.peek();
      if (!state) return;

      state.audioElement.pause();
      state.audioElement.currentTime = 0;
      audioCache.markStopped(segmentId);
      audioCache.release(segmentId);

      $store.playingSegments[segmentId]?.delete();
      stopProgressLoopIfNeeded();
    },

    stopAllSegments: () => {
      const playing = $store.playingSegments.peek();
      batch(() => {
        for (const segmentId of Object.keys(playing)) {
          const state = playing[segmentId];
          if (state) {
            state.audioElement.pause();
            state.audioElement.currentTime = 0;
            audioCache.markStopped(segmentId);
            audioCache.release(segmentId);
          }
        }
        $store.playingSegments.set({});
      });
      stopProgressLoop();
    },

    // Internal helpers
    _updateProgress: (segmentId: string, progress: number) => {
      $store.playingSegments[segmentId]?.progress.set(progress);
    },

    _setStatus: (segmentId: string, status: PlayingSegmentState["status"]) => {
      $store.playingSegments[segmentId]?.status.set(status);
    },
  }) as $SpeakersStore;

  // Progress update loop
  function updateProgress() {
    const playing = $store.playingSegments.peek();

    for (const [segmentId, state] of Object.entries(playing)) {
      if (state.status !== "playing") continue;

      const audio = state.audioElement;
      const progress =
        audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      $store._updateProgress(segmentId, progress);
    }

    rafId = requestAnimationFrame(updateProgress);
  }

  function startProgressLoop() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(updateProgress);
  }

  function stopProgressLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function stopProgressLoopIfNeeded() {
    const playing = $store.playingSegments.peek();
    const hasPlaying = Object.values(playing).some(
      (s) => s.status === "playing",
    );
    if (!hasPlaying) {
      stopProgressLoop();
    }
  }

  return { $store, cleanup: () => stopProgressLoop() };
}

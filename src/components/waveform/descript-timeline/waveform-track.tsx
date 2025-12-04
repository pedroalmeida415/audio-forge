"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { TIMELINE_CONSTANTS } from "./timeline-styles";

type WaveformTrackProps = {
  audioUrl: string | null;
  pxPerSec: number;
  playbackSpeed: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSeek: (time: number) => void;
  onReady: () => void;
  wavesurferRef: React.RefObject<WaveSurfer | null>;
  /** Ref that gets updated at full refresh rate for smooth playhead animation */
  currentTimeRef: React.RefObject<number>;
};

// Throttle interval for React state updates (ms)
// Visual updates (playhead) use refs and run at native refresh rate
const STATE_UPDATE_THROTTLE_MS = 50;

export function WaveformTrack({
  audioUrl,
  pxPerSec,
  playbackSpeed,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onSeek,
  onReady,
  wavesurferRef,
  currentTimeRef,
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Track the actual loaded URL to prevent unnecessary re-initialization
  const loadedUrlRef = useRef<string | null>(null);

  // Refs for throttling state updates
  const lastStateUpdateRef = useRef(0);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  // Keep callback ref updated
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!(containerRef.current && audioUrl)) {
      return;
    }

    // Cast to mutable for assignments
    const wsRef = wavesurferRef as React.MutableRefObject<WaveSurfer | null>;
    const timeRef = currentTimeRef as React.MutableRefObject<number>;

    // Skip re-initialization if the URL hasn't changed AND instance still exists
    // This prevents tab focus / strict mode from causing a reset
    if (loadedUrlRef.current === audioUrl && wsRef.current) {
      // Instance already exists for this URL, nothing to do
      return;
    }

    // Only destroy if URL actually changed (not on remount with same URL)
    if (wsRef.current && loadedUrlRef.current !== audioUrl) {
      wsRef.current.destroy();
      wsRef.current = null;
    }

    // If instance was destroyed but URL is same (shouldn't happen normally),
    // we still need to re-create
    if (wsRef.current) {
      // Instance exists and URL matches, skip
      return;
    }

    setIsLoaded(false);
    loadedUrlRef.current = audioUrl;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#64748b",
      progressColor: "#3b82f6",
      cursorColor: "transparent", // We render our own playhead
      cursorWidth: 0,
      height: TIMELINE_CONSTANTS.TRACK_HEIGHT,
      normalize: true,
      minPxPerSec: pxPerSec,
      fillParent: false, // Use actual width based on duration
      interact: true,
      dragToSeek: true,
      autoScroll: false,
      autoCenter: false,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
    });

    wsRef.current = ws;

    ws.on("ready", () => {
      const dur = ws.getDuration();
      onDurationChange(dur);
      setIsLoaded(true);
      onReady();
    });

    // Update time ref at full rate for smooth playhead animation
    // NO React state updates during playback - all visuals read from ref
    ws.on("timeupdate", (time) => {
      timeRef.current = time;
    });

    ws.on("play", () => onPlayingChange(true));
    // Sync React state when playback stops (for UI that needs it)
    ws.on("pause", () => {
      onTimeUpdateRef.current(timeRef.current);
      onPlayingChange(false);
    });
    ws.on("finish", () => {
      onTimeUpdateRef.current(timeRef.current);
      onPlayingChange(false);
    });

    ws.on("click", (relativeX) => {
      const duration = ws.getDuration();
      const time = relativeX * duration;
      onSeek(time);
    });

    ws.load(audioUrl);

    // No cleanup here - we handle cleanup at the start of the effect when URL changes
    // This prevents tab focus/blur from causing unnecessary re-initialization
  }, [audioUrl]);

  // Cleanup on actual unmount (when component is removed from DOM)
  useEffect(() => {
    const wsRef = wavesurferRef as React.MutableRefObject<WaveSurfer | null>;
    return () => {
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      loadedUrlRef.current = null;
    };
  }, [wavesurferRef]);

  // Update zoom level
  useEffect(() => {
    if (wavesurferRef.current && isLoaded) {
      wavesurferRef.current.zoom(pxPerSec);
    }
  }, [pxPerSec, isLoaded]);

  // Update playback speed
  useEffect(() => {
    if (wavesurferRef.current && isLoaded) {
      wavesurferRef.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed, isLoaded]);

  return (
    <div
      className="relative bg-card/50"
      style={{ height: TIMELINE_CONSTANTS.TRACK_HEIGHT }}
    >
      {/* Loading state */}
      {!isLoaded && audioUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading waveform...
          </div>
        </div>
      )}

      {/* No audio state */}
      {!audioUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          No audio loaded
        </div>
      )}

      {/* WaveSurfer container */}
      <div
        className={isLoaded && audioUrl ? "" : "invisible"}
        ref={containerRef}
      />
    </div>
  );
}

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
  wavesurferRef: React.MutableRefObject<WaveSurfer | null>;
};

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
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!(containerRef.current && audioUrl)) {
      return;
    }

    // Cleanup existing instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    setIsLoaded(false);

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

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      const dur = ws.getDuration();
      onDurationChange(dur);
      setIsLoaded(true);
      onReady();
    });

    ws.on("timeupdate", (time) => {
      onTimeUpdate(time);
    });

    ws.on("play", () => onPlayingChange(true));
    ws.on("pause", () => onPlayingChange(false));
    ws.on("finish", () => onPlayingChange(false));

    ws.on("click", (relativeX) => {
      const duration = ws.getDuration();
      const time = relativeX * duration;
      onSeek(time);
    });

    ws.load(audioUrl);

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl]);

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
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
        ref={containerRef}
        className={isLoaded && audioUrl ? "" : "invisible"}
      />
    </div>
  );
}

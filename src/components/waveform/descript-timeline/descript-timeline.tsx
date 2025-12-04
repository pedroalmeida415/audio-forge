"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { DiarizationSegment } from "~/server/db/schema";
import { Playhead } from "./playhead";
import { ScrubberBar } from "./scrubber-bar";
import { SpeakerBar } from "./speaker-bar";
import { TIMELINE_CONSTANTS } from "./timeline-styles";
import { TimelineToolbar } from "./timeline-toolbar";
import { Timestrip } from "./timestrip";
import { useTimelineState } from "./use-timeline-state";
import { WaveformTrack } from "./waveform-track";

type DescriptTimelineProps = {
  audioUrl: string | null;
  segments: DiarizationSegment[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  onSegmentUpdate?: (
    segmentId: string,
    startTime: number,
    endTime: number
  ) => void;
};

export function DescriptTimeline({
  audioUrl,
  segments,
  selectedSegmentId,
  onSegmentSelect,
}: DescriptTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for values needed in effects without triggering re-creation
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const isPlayingRef = useRef(isPlaying);

  // Keep refs in sync with state
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const timeline = useTimelineState();

  // Build speaker color map for consistent colors
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    for (const segment of sortedSegments) {
      if (!map.has(segment.speaker)) {
        map.set(segment.speaker, map.size);
      }
    }
    return map;
  }, [segments]);

  // Calculate total width - extend beyond audio to fill container
  const audioWidth = timeline.getTotalWidth(duration);
  const totalWidth = Math.max(audioWidth, containerWidth);

  // Content height for playhead
  const contentHeight =
    TIMELINE_CONSTANTS.TIMESTRIP_HEIGHT +
    TIMELINE_CONSTANTS.SPEAKER_BAR_HEIGHT +
    TIMELINE_CONSTANTS.TRACK_HEIGHT;

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync scroll position to timeline state
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      timeline.setScrollX(scrollContainerRef.current.scrollLeft);
    }
  }, [timeline]);

  // Ctrl+wheel zoom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        timeline.setZoomPercent(timeline.zoomPercent + delta);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [timeline]);

  // Auto-scroll to follow playhead during playback
  // Only runs RAF loop when playing to save resources
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let animationId: number;

    const updateScroll = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const currentPlayheadX = currentTimeRef.current * timeline.pxPerSec;
        const scrollLeft = container.scrollLeft;
        const viewportWidth = container.clientWidth;

        // Check if playhead is outside visible area
        const margin = viewportWidth * 0.2;
        if (currentPlayheadX > scrollLeft + viewportWidth - margin) {
          container.scrollLeft = currentPlayheadX - margin;
        } else if (currentPlayheadX < scrollLeft + margin) {
          container.scrollLeft = Math.max(0, currentPlayheadX - margin);
        }
      }
      animationId = requestAnimationFrame(updateScroll);
    };

    animationId = requestAnimationFrame(updateScroll);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, timeline.pxPerSec]);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      if (wavesurferRef.current && duration > 0) {
        const clampedTime = Math.max(0, Math.min(time, duration));
        wavesurferRef.current.seekTo(clampedTime / duration);
        // Update ref immediately for smooth visual feedback
        currentTimeRef.current = clampedTime;
        // Also update state for any components that need it
        setCurrentTime(clampedTime);
      }
    },
    [duration]
  );

  // Navigate to prev/next segment - read from ref to avoid recreating callbacks
  const handleSeekPrev = useCallback(() => {
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    const time = currentTimeRef.current;
    const prevSegment = sortedSegments
      .filter((s) => s.start < time - 0.1)
      .pop();
    if (prevSegment) {
      handleSeek(prevSegment.start);
      onSegmentSelect(prevSegment.id);
    }
  }, [segments, handleSeek, onSegmentSelect]);

  const handleSeekNext = useCallback(() => {
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    const time = currentTimeRef.current;
    const nextSegment = sortedSegments.find((s) => s.start > time + 0.1);
    if (nextSegment) {
      handleSeek(nextSegment.start);
      onSegmentSelect(nextSegment.id);
    }
  }, [segments, handleSeek, onSegmentSelect]);

  // Keyboard shortcuts - use refs to avoid recreation on every time update
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          if (e.metaKey || e.ctrlKey) {
            handleSeekPrev();
          } else {
            handleSeek(Math.max(0, currentTimeRef.current - 1));
          }
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            handleSeekNext();
          } else {
            handleSeek(
              Math.min(durationRef.current, currentTimeRef.current + 1)
            );
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleSeek, handleSeekPrev, handleSeekNext]);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border bg-background"
      ref={containerRef}
    >
      {/* Scrubber bar at top */}
      <div className="border-border/30 border-b bg-muted/20 px-3 py-2">
        <ScrubberBar
          currentTimeRef={currentTimeRef}
          disabled={!isReady}
          duration={duration}
          onSeek={handleSeek}
        />
      </div>

      {/* Toolbar */}
      <TimelineToolbar
        currentTimeRef={currentTimeRef}
        disabled={!isReady}
        duration={duration}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onSeekNext={handleSeekNext}
        onSeekPrev={handleSeekPrev}
        onSpeedChange={timeline.setPlaybackSpeed}
        onZoomIn={timeline.zoomIn}
        onZoomOut={timeline.zoomOut}
        onZoomPreset={timeline.setZoomPercent}
        playbackSpeed={timeline.playbackSpeed}
        zoomPercent={timeline.zoomPercent}
      />

      {/* Scrollable timeline content - always show scrollbar */}
      <div
        className="relative overflow-y-hidden overflow-x-scroll"
        onScroll={handleScroll}
        ref={scrollContainerRef}
        style={{ scrollbarGutter: "stable" }}
      >
        {/* Inner container with full width */}
        <div
          className="relative"
          style={{ width: totalWidth, minWidth: "100%" }}
        >
          {/* Timestrip - spans full width */}
          <Timestrip
            duration={duration}
            pxPerSec={timeline.pxPerSec}
            totalWidth={totalWidth}
          />

          {/* Speaker bar */}
          <SpeakerBar
            onSegmentClick={onSegmentSelect}
            pxPerSec={timeline.pxPerSec}
            scrollLeft={timeline.scrollX}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            speakerColorMap={speakerColorMap}
            viewportWidth={containerWidth}
          />

          {/* Waveform track */}
          <WaveformTrack
            audioUrl={audioUrl}
            currentTimeRef={currentTimeRef}
            onDurationChange={setDuration}
            onPlayingChange={setIsPlaying}
            onReady={() => setIsReady(true)}
            onSeek={handleSeek}
            onTimeUpdate={setCurrentTime}
            playbackSpeed={timeline.playbackSpeed}
            pxPerSec={timeline.pxPerSec}
            wavesurferRef={wavesurferRef}
          />

          {/* Playhead overlay - positioned absolutely within scroll container */}
          {isReady && (
            <Playhead
              currentTimeRef={currentTimeRef}
              height={contentHeight}
              isPlaying={isPlaying}
              pxPerSec={timeline.pxPerSec}
            />
          )}
        </div>
      </div>
    </div>
  );
}

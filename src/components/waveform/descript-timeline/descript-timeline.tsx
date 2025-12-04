"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  // Calculate playhead position relative to scroll
  const playheadX = currentTime * timeline.pxPerSec;

  // Content height for playhead
  const contentHeight =
    TIMELINE_CONSTANTS.TIMESTRIP_HEIGHT +
    TIMELINE_CONSTANTS.SPEAKER_BAR_HEIGHT +
    TIMELINE_CONSTANTS.TRACK_HEIGHT;

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;

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
    if (!container) return;

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
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const viewportWidth = container.clientWidth;

    // Check if playhead is outside visible area
    const margin = viewportWidth * 0.2;
    if (playheadX > scrollLeft + viewportWidth - margin) {
      container.scrollLeft = playheadX - margin;
    } else if (playheadX < scrollLeft + margin) {
      container.scrollLeft = Math.max(0, playheadX - margin);
    }
  }, [currentTime, isPlaying, playheadX]);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (wavesurferRef.current && duration > 0) {
      const clampedTime = Math.max(0, Math.min(time, duration));
      wavesurferRef.current.seekTo(clampedTime / duration);
      setCurrentTime(clampedTime);
    }
  }, [duration]);

  // Navigate to prev/next segment
  const handleSeekPrev = useCallback(() => {
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    const prevSegment = sortedSegments
      .filter((s) => s.start < currentTime - 0.1)
      .pop();
    if (prevSegment) {
      handleSeek(prevSegment.start);
      onSegmentSelect(prevSegment.id);
    }
  }, [segments, currentTime, handleSeek, onSegmentSelect]);

  const handleSeekNext = useCallback(() => {
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    const nextSegment = sortedSegments.find((s) => s.start > currentTime + 0.1);
    if (nextSegment) {
      handleSeek(nextSegment.start);
      onSegmentSelect(nextSegment.id);
    }
  }, [segments, currentTime, handleSeek, onSegmentSelect]);

  // Keyboard shortcuts
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
            handleSeek(Math.max(0, currentTime - 1));
          }
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            handleSeekNext();
          } else {
            handleSeek(Math.min(duration, currentTime + 1));
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleSeek, handleSeekPrev, handleSeekNext, currentTime, duration]);

  return (
    <div ref={containerRef} className="flex flex-col bg-background rounded-lg border overflow-hidden">
      {/* Scrubber bar at top */}
      <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
        <ScrubberBar
          currentTime={currentTime}
          duration={duration}
          disabled={!isReady}
          onSeek={handleSeek}
        />
      </div>

      {/* Toolbar */}
      <TimelineToolbar
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        zoomPercent={timeline.zoomPercent}
        playbackSpeed={timeline.playbackSpeed}
        disabled={!isReady}
        onPlayPause={handlePlayPause}
        onSeekPrev={handleSeekPrev}
        onSeekNext={handleSeekNext}
        onZoomIn={timeline.zoomIn}
        onZoomOut={timeline.zoomOut}
        onZoomPreset={timeline.setZoomPercent}
        onSpeedChange={timeline.setPlaybackSpeed}
      />

      {/* Scrollable timeline content - always show scrollbar */}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-scroll overflow-y-hidden"
        style={{ scrollbarGutter: "stable" }}
        onScroll={handleScroll}
      >
        {/* Inner container with full width */}
        <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
          {/* Timestrip - spans full width */}
          <Timestrip
            duration={duration}
            pxPerSec={timeline.pxPerSec}
            totalWidth={totalWidth}
          />

          {/* Speaker bar */}
          <SpeakerBar
            segments={segments}
            speakerColorMap={speakerColorMap}
            pxPerSec={timeline.pxPerSec}
            selectedSegmentId={selectedSegmentId}
            onSegmentClick={onSegmentSelect}
          />

          {/* Waveform track */}
          <WaveformTrack
            audioUrl={audioUrl}
            pxPerSec={timeline.pxPerSec}
            playbackSpeed={timeline.playbackSpeed}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onPlayingChange={setIsPlaying}
            onSeek={handleSeek}
            onReady={() => setIsReady(true)}
            wavesurferRef={wavesurferRef}
          />

          {/* Playhead overlay - positioned absolutely within scroll container */}
          {isReady && (
            <Playhead
              x={playheadX}
              height={contentHeight}
              isPlaying={isPlaying}
            />
          )}
        </div>
      </div>
    </div>
  );
}

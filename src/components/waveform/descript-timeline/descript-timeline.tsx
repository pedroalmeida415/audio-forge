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
  onSegmentUpdate,
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

  // Calculate total width and playhead position
  const totalWidth = timeline.getTotalWidth(duration);
  const playheadX = timeline.timeToX(currentTime);

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

  // Sync scroll position
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      timeline.setScrollX(scrollContainerRef.current.scrollLeft);
    }
  }, [timeline.setScrollX]);

  // Auto-scroll to follow playhead during playback
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const playheadAbsoluteX = currentTime * timeline.pxPerSec;
    const scrollLeft = container.scrollLeft;
    const viewportWidth = container.clientWidth;

    // Check if playhead is outside visible area
    const margin = viewportWidth * 0.2; // 20% margin
    if (playheadAbsoluteX > scrollLeft + viewportWidth - margin) {
      container.scrollLeft = playheadAbsoluteX - margin;
    } else if (playheadAbsoluteX < scrollLeft + margin) {
      container.scrollLeft = Math.max(0, playheadAbsoluteX - margin);
    }
  }, [currentTime, isPlaying, timeline.pxPerSec]);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (wavesurferRef.current && duration > 0) {
      wavesurferRef.current.seekTo(time / duration);
      setCurrentTime(time);
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

      {/* Scrollable timeline content */}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-auto overflow-y-hidden"
        onScroll={handleScroll}
      >
        {/* Inner container with full width */}
        <div style={{ width: Math.max(totalWidth, containerWidth), minWidth: "100%" }}>
          {/* Timestrip */}
          <Timestrip
            duration={duration}
            pxPerSec={timeline.pxPerSec}
            scrollX={timeline.scrollX}
            containerWidth={containerWidth}
          />

          {/* Speaker bar (Wordbar equivalent) */}
          <SpeakerBar
            segments={segments}
            speakerColorMap={speakerColorMap}
            pxPerSec={timeline.pxPerSec}
            scrollX={timeline.scrollX}
            containerWidth={containerWidth}
            selectedSegmentId={selectedSegmentId}
            onSegmentClick={onSegmentSelect}
          />

          {/* Waveform track */}
          <WaveformTrack
            audioUrl={audioUrl}
            segments={segments}
            speakerColorMap={speakerColorMap}
            selectedSegmentId={selectedSegmentId}
            pxPerSec={timeline.pxPerSec}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onPlayingChange={setIsPlaying}
            onSegmentClick={onSegmentSelect}
            onSegmentUpdate={onSegmentUpdate}
            onSeek={handleSeek}
            onReady={() => setIsReady(true)}
            wavesurferRef={wavesurferRef}
          />
        </div>

        {/* Playhead overlay */}
        {isReady && playheadX >= 0 && (
          <Playhead
            x={playheadX}
            height={contentHeight}
            isPlaying={isPlaying}
          />
        )}
      </div>
    </div>
  );
}

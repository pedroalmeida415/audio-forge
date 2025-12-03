"use client";

import { Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getSpeakerBgColor,
  getSpeakerHighlightColor,
  SPEAKER_COLORS,
} from "~/lib/speaker-colors";
import type { DiarizationSegment } from "~/server/db/schema";
import { useWaveSurfer } from "./use-wavesurfer";

type WaveformViewerProps = {
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

export function WaveformViewer({
  audioUrl,
  segments,
  selectedSegmentId,
  onSegmentSelect,
  onSegmentUpdate,
}: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const speakerColorMap = useRef(new Map<string, number>());

  const getSpeakerColorIndex = useCallback((speakerLabel: string): number => {
    let index = speakerColorMap.current.get(speakerLabel);
    if (index === undefined) {
      index = speakerColorMap.current.size;
      speakerColorMap.current.set(speakerLabel, index);
    }
    return index;
  }, []);

  const debouncedSegmentUpdate = useDebouncedCallback(
    (segmentId: string, start: number, end: number) => {
      onSegmentUpdate?.(segmentId, start, end);
    },
    500
  );

  const handleRegionUpdate = useCallback(
    (region: Region) => {
      debouncedSegmentUpdate(region.id, region.start, region.end);
    },
    [debouncedSegmentUpdate]
  );

  const handleRegionClick = useCallback(
    (region: Region) => {
      onSegmentSelect(region.id);
    },
    [onSegmentSelect]
  );

  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    playPause,
    zoom,
    addRegion,
    clearRegions,
    updateRegion,
  } = useWaveSurfer({
    containerRef,
    audioUrl,
    onRegionUpdate: handleRegionUpdate,
    onRegionClick: handleRegionClick,
  });

  // Sync segments to regions when segments change
  useEffect(() => {
    if (!isReady) {
      return;
    }

    clearRegions();

    for (const segment of segments) {
      const colorIndex = getSpeakerColorIndex(segment.speaker);
      const color = getSpeakerBgColor(colorIndex);
      addRegion({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        color,
        drag: !!onSegmentUpdate,
        resize: !!onSegmentUpdate,
      });
    }
  }, [
    isReady,
    segments,
    clearRegions,
    addRegion,
    getSpeakerColorIndex,
    onSegmentUpdate,
  ]);

  // Highlight selected segment
  useEffect(() => {
    if (!(isReady && selectedSegmentId)) {
      return;
    }

    // Update all regions to show/hide selection state
    for (const segment of segments) {
      const isSelected = segment.id === selectedSegmentId;
      const colorIndex = getSpeakerColorIndex(segment.speaker);
      const baseColor = getSpeakerBgColor(colorIndex);
      const highlightColor = getSpeakerHighlightColor(colorIndex);

      updateRegion(segment.id, {
        color: isSelected ? highlightColor : baseColor,
      });
    }
  }, [isReady, selectedSegmentId, segments, updateRegion, getSpeakerColorIndex]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="space-y-4">
      {/* Waveform container */}
      <div className="rounded-lg border bg-muted/30 p-4">
        {!audioUrl && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No audio loaded
          </div>
        )}
        {audioUrl && !isReady && <Skeleton className="h-32 w-full" />}
        <div
          className={isReady && audioUrl ? "" : "hidden"}
          ref={containerRef}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            disabled={!isReady}
            onClick={playPause}
            size="icon"
            variant="outline"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <span className="min-w-[120px] font-mono text-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            disabled={!isReady}
            onClick={() => zoom(25)}
            size="icon"
            title="Zoom out"
            variant="outline"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            disabled={!isReady}
            onClick={() => zoom(100)}
            size="icon"
            title="Reset zoom"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            disabled={!isReady}
            onClick={() => zoom(200)}
            size="icon"
            title="Zoom in"
            variant="outline"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

    </div>
  );
}

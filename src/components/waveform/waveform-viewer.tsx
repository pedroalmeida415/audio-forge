"use client";

import { Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useWaveSurfer } from "./use-wavesurfer";

// Speaker colors for visual distinction
const SPEAKER_COLORS = [
  "rgba(239, 68, 68, 0.4)", // Red
  "rgba(59, 130, 246, 0.4)", // Blue
  "rgba(234, 179, 8, 0.4)", // Yellow
  "rgba(34, 197, 94, 0.4)", // Green
  "rgba(168, 85, 247, 0.4)", // Purple
  "rgba(249, 115, 22, 0.4)", // Orange
  "rgba(236, 72, 153, 0.4)", // Pink
  "rgba(20, 184, 166, 0.4)", // Teal
];

interface Segment {
  id: string;
  pyannoteSpeakerLabel: string;
  editedStartTime: number;
  editedEndTime: number;
  status: string;
  collectionId: string | null;
}

interface WaveformViewerProps {
  audioUrl: string | null;
  segments: Segment[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  onSegmentUpdate: (
    segmentId: string,
    startTime: number,
    endTime: number
  ) => void;
}

export function WaveformViewer({
  audioUrl,
  segments,
  selectedSegmentId,
  onSegmentSelect,
  onSegmentUpdate,
}: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const speakerColorMap = useRef(new Map<string, number>());

  const getSpeakerColor = useCallback((speakerLabel: string): string => {
    let index = speakerColorMap.current.get(speakerLabel);
    if (index === undefined) {
      index = speakerColorMap.current.size;
      speakerColorMap.current.set(speakerLabel, index);
    }
    return SPEAKER_COLORS[index % SPEAKER_COLORS.length]!;
  }, []);

  const debouncedSegmentUpdate = useDebouncedCallback(
    (segmentId: string, start: number, end: number) => {
      onSegmentUpdate(segmentId, start, end);
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
    if (!isReady) return;

    clearRegions();

    for (const segment of segments) {
      if (segment.status === "excluded") continue;

      const color = getSpeakerColor(segment.pyannoteSpeakerLabel);
      addRegion({
        id: segment.id,
        start: segment.editedStartTime,
        end: segment.editedEndTime,
        color,
        drag: true,
        resize: true,
      });
    }
  }, [isReady, segments, clearRegions, addRegion, getSpeakerColor]);

  // Highlight selected segment
  useEffect(() => {
    if (!(isReady && selectedSegmentId)) return;

    // Update all regions to show/hide selection state
    for (const segment of segments) {
      if (segment.status === "excluded") continue;

      const isSelected = segment.id === selectedSegmentId;
      const baseColor = getSpeakerColor(segment.pyannoteSpeakerLabel);
      const selectedColor = baseColor.replace("0.4", "0.7");

      updateRegion(segment.id, {
        color: isSelected ? selectedColor : baseColor,
      });
    }
  }, [isReady, selectedSegmentId, segments, updateRegion, getSpeakerColor]);

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
        {audioUrl ? (
          isReady ? null : (
            <Skeleton className="h-32 w-full" />
          )
        ) : (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No audio loaded
          </div>
        )}
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

      {/* Speaker legend */}
      <div className="flex flex-wrap gap-2">
        {[...speakerColorMap.current.entries()].map(([speaker, index]) => (
          <div className="flex items-center gap-1.5" key={speaker}>
            <div
              className="h-3 w-3 rounded"
              style={{
                backgroundColor: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
              }}
            />
            <span className="text-muted-foreground text-xs">{speaker}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

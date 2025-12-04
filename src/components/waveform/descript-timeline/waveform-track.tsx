"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import type { Region, RegionParams } from "wavesurfer.js/dist/plugins/regions.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { getSpeakerBgColor, getSpeakerHighlightColor } from "~/lib/speaker-colors";
import type { DiarizationSegment } from "~/server/db/schema";
import { TIMELINE_CONSTANTS } from "./timeline-styles";

type WaveformTrackProps = {
  audioUrl: string | null;
  segments: DiarizationSegment[];
  speakerColorMap: Map<string, number>;
  selectedSegmentId: string | null;
  pxPerSec: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSegmentClick: (segmentId: string) => void;
  onSegmentUpdate?: (segmentId: string, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onReady: () => void;
  wavesurferRef: React.MutableRefObject<WaveSurfer | null>;
};

const SNAP_GRID = 0.1;

function snapToGrid(time: number): number {
  return Math.round(time / SNAP_GRID) * SNAP_GRID;
}

export function WaveformTrack({
  audioUrl,
  segments,
  speakerColorMap,
  selectedSegmentId,
  pxPerSec,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onSegmentClick,
  onSegmentUpdate,
  onReady,
  wavesurferRef,
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
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
      regionsRef.current = null;
    }

    setIsLoaded(false);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#64748b",
      progressColor: "#3b82f6",
      cursorColor: "transparent", // We'll render our own playhead
      cursorWidth: 0,
      height: TIMELINE_CONSTANTS.TRACK_HEIGHT,
      normalize: true,
      minPxPerSec: pxPerSec,
      fillParent: false, // Important: use actual width based on duration
      interact: true,
      dragToSeek: true,
      autoScroll: false,
      autoCenter: false,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());

    wavesurferRef.current = ws;
    regionsRef.current = regions;

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
      ws.seekTo(relativeX);
      onTimeUpdate(time);
    });

    // Region events
    regions.on("region-updated", (region) => {
      const snappedStart = snapToGrid(region.start);
      const snappedEnd = snapToGrid(region.end);

      if (snappedStart !== region.start || snappedEnd !== region.end) {
        region.setOptions({
          start: snappedStart,
          end: snappedEnd,
        });
      }

      onSegmentUpdate?.(region.id, snappedStart, snappedEnd);
    });

    regions.on("region-clicked", (region, e) => {
      e.stopPropagation();
      onSegmentClick(region.id);
    });

    ws.load(audioUrl);

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
    };
  }, [audioUrl]);

  // Update zoom level
  useEffect(() => {
    if (wavesurferRef.current && isLoaded) {
      wavesurferRef.current.zoom(pxPerSec);
    }
  }, [pxPerSec, isLoaded]);

  // Sync segments to regions
  useEffect(() => {
    if (!(isLoaded && regionsRef.current)) return;

    regionsRef.current.clearRegions();

    for (const segment of segments) {
      const colorIndex = speakerColorMap.get(segment.speaker) ?? 0;
      const color = getSpeakerBgColor(colorIndex);

      regionsRef.current.addRegion({
        id: segment.id,
        start: snapToGrid(segment.start),
        end: snapToGrid(segment.end),
        color,
        drag: !!onSegmentUpdate,
        resize: !!onSegmentUpdate,
      } as RegionParams);
    }
  }, [isLoaded, segments, speakerColorMap, onSegmentUpdate]);

  // Highlight selected segment
  useEffect(() => {
    if (!(isLoaded && regionsRef.current)) return;

    const regions = regionsRef.current.getRegions();
    for (const region of regions) {
      const segment = segments.find((s) => s.id === region.id);
      if (!segment) continue;

      const isSelected = segment.id === selectedSegmentId;
      const colorIndex = speakerColorMap.get(segment.speaker) ?? 0;
      const color = isSelected
        ? getSpeakerHighlightColor(colorIndex)
        : getSpeakerBgColor(colorIndex);

      region.setOptions({ color });
    }
  }, [isLoaded, selectedSegmentId, segments, speakerColorMap]);

  return (
    <div
      className="relative bg-card/50 overflow-hidden"
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

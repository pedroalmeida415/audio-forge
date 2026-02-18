"use client";

import { Minus, Pause, Play, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { effect } from "valtio-reactive";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { TIMELINE_CONSTANTS } from "~/features/workspace/store/constants";
import { isZoomEnabled } from "~/features/workspace/utils/zoom-utils";
import { formatTimestamp } from "~/lib/time-utils";
import type { Segment, Speaker } from "~/server/db/schema";
import { ActiveSegmentActions } from "./active-segment-actions";
import { InlineSelectionControls } from "./inline-selection-controls";

const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;

const PLAYBACK_RATES = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "2", label: "2x" },
];

// Separate component for time display that updates via effect()
function TimeDisplay() {
  const { store } = useWorkspaceStore();
  const snap = useSnapshot(store);
  const timeRef = useRef<HTMLSpanElement>(null);
  const lastFlooredTimeRef = useRef(-1);

  useEffect(() => {
    // Set initial time
    const initialTime = store.currentTime;
    lastFlooredTimeRef.current = Math.floor(initialTime);
    if (timeRef.current) {
      timeRef.current.textContent = formatTimestamp(initialTime);
    }

    // Only update when the floored second changes (formatTimestamp shows whole seconds)
    const dispose = effect(() => {
      const time = store.currentTime;
      const flooredTime = Math.floor(time);
      if (flooredTime !== lastFlooredTimeRef.current) {
        lastFlooredTimeRef.current = flooredTime;
        if (timeRef.current) {
          timeRef.current.textContent = formatTimestamp(time);
        }
      }
    });

    return dispose;
  }, [store]);

  return (
    <div className="font-mono text-muted-foreground text-sm">
      <span ref={timeRef}>{formatTimestamp(store.currentTime)}</span> /{" "}
      {formatTimestamp(snap.duration)}
    </div>
  );
}

interface TimelineToolbarProps {
  segments: Segment[];
  speakers: Speaker[];
  sourceId: string;
  projectId: string;
  speakerId: string | null;
}

export function TimelineToolbar({
  segments,
  speakers,
  sourceId,
  projectId,
  speakerId,
}: TimelineToolbarProps) {
  const { store } = useWorkspaceStore();

  const snap = useSnapshot(store);
  const isPlaying = snap.isPlaying;
  const isLoading = snap.isLoading;
  const playbackRate = snap.playbackRate;
  const zoomLevel = snap.zoomLevel;
  const duration = snap.duration;

  // Disable zoom for short audio (< 15 seconds)
  const zoomEnabled = isZoomEnabled(duration);

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2">
      {/* Play/Pause button */}
      <Button
        aria-label={isPlaying ? "Pause" : "Play"}
        className="h-9 w-9"
        disabled={isLoading}
        onClick={() => store.togglePlayback()}
        size="icon"
        variant="secondary"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Playback speed */}
      <Select
        onValueChange={(value) => store.setPlaybackRate(Number(value))}
        value={String(playbackRate)}
      >
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAYBACK_RATES.map((rate) => (
            <SelectItem key={rate.value} value={rate.value}>
              {rate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Current time / Duration */}
      <TimeDisplay />

      {/* Active segment actions (shown when a segment is selected) */}
      <ActiveSegmentActions
        segments={segments}
        speakers={speakers}
        sourceId={sourceId}
        projectId={projectId}
      />

      {/* Selection controls (shown during drag-to-select) */}
      <InlineSelectionControls
        speakers={speakers}
        sourceId={sourceId}
        projectId={projectId}
        speakerId={speakerId}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button
          aria-label="Zoom out"
          disabled={!zoomEnabled || zoomLevel <= MIN_ZOOM}
          onClick={() => store.zoomOut()}
          size="icon"
          variant="ghost"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Slider
          aria-label="Zoom level"
          className="w-24"
          disabled={!zoomEnabled}
          max={MAX_ZOOM}
          min={MIN_ZOOM}
          onValueChange={([value]) => value && store.zoomAtPlayhead(value)}
          step={1}
          value={[zoomLevel]}
        />

        <Button
          aria-label="Zoom in"
          disabled={!zoomEnabled || zoomLevel >= MAX_ZOOM}
          onClick={() => store.zoomIn()}
          size="icon"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-12 cursor-help text-center font-mono text-muted-foreground text-sm">
              {zoomEnabled ? `${zoomLevel}%` : "N/A"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {zoomEnabled
              ? "Use Ctrl + mouse wheel to zoom"
              : "Zoom disabled for short audio"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

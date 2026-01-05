"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { useEffect, useRef } from "react";
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
import { useClippingStore } from "~/features/clipping/context/store.context";
import { TIMELINE_CONSTANTS } from "~/features/clipping/store/constants";
import { isZoomEnabled } from "~/features/clipping/utils/zoom-utils";
import { formatTimestamp } from "~/lib/time-utils";
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

// Separate component for time display that updates via subscription
function TimeDisplay() {
  const $store = useClippingStore();
  const duration = useValue($store.playback.duration);
  const timeRef = useRef<HTMLSpanElement>(null);
  const lastFlooredTimeRef = useRef(-1);

  useEffect(() => {
    // Set initial time
    const initialTime = $store.playback.currentTime.peek();
    lastFlooredTimeRef.current = Math.floor(initialTime);
    if (timeRef.current) {
      timeRef.current.textContent = formatTimestamp(initialTime);
    }

    // Only update when the floored second changes (formatTimestamp shows whole seconds)
    const dispose = observe(() => {
      const time = $store.playback.currentTime.get();
      const flooredTime = Math.floor(time);
      if (flooredTime !== lastFlooredTimeRef.current) {
        lastFlooredTimeRef.current = flooredTime;
        if (timeRef.current) {
          timeRef.current.textContent = formatTimestamp(time);
        }
      }
    });

    return dispose;
  }, [$store]);

  return (
    <div className="font-mono text-muted-foreground text-sm">
      <span ref={timeRef}>
        {formatTimestamp($store.playback.currentTime.peek())}
      </span>{" "}
      / {formatTimestamp(duration)}
    </div>
  );
}

export function TimelineToolbar() {
  const $store = useClippingStore();

  const isPlaying = useValue($store.playback.isPlaying);
  const isLoading = useValue($store.playback.isLoading);
  const playbackRate = useValue($store.playback.playbackRate);
  const zoomLevel = useValue($store.timeline.zoomLevel);
  const duration = useValue($store.playback.duration);

  // Disable zoom for short audio (< 15 seconds)
  const zoomEnabled = isZoomEnabled(duration);

  const { togglePlayback, setPlaybackRate, zoomIn, zoomOut, zoomAtPlayhead } =
    $store.playback.peek();

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2">
      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          onClick={() => $store.navigateSegment("prev")}
          size="icon"
          title="Previous segment"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => $store.navigateSegment("next")}
          size="icon"
          title="Next segment"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Play/Pause button */}
      <Button
        className="h-9 w-9"
        disabled={isLoading}
        onClick={togglePlayback}
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
        onValueChange={(value) => setPlaybackRate(Number(value))}
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
      <ActiveSegmentActions />

      {/* Selection controls (shown during drag-to-select) */}
      <InlineSelectionControls />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button
          disabled={!zoomEnabled || zoomLevel <= MIN_ZOOM}
          onClick={zoomOut}
          size="icon"
          title="Zoom out"
          variant="ghost"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Slider
          className="w-24"
          disabled={!zoomEnabled}
          max={MAX_ZOOM}
          min={MIN_ZOOM}
          onValueChange={([value]) => value && zoomAtPlayhead(value)}
          step={1}
          value={[zoomLevel]}
        />

        <Button
          disabled={!zoomEnabled || zoomLevel >= MAX_ZOOM}
          onClick={zoomIn}
          size="icon"
          title="Zoom in"
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

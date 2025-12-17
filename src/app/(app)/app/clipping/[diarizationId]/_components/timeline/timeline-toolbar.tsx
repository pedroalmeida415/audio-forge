"use client";

import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { formatTimestamp } from "~/lib/time-utils";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-workspace-store";

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
  const store = useClippingStore();
  const duration = useClippingStore((s) => s.playback.duration);
  const timeRef = useRef<HTMLSpanElement>(null);
  const lastFlooredTimeRef = useRef(-1);

  useEffect(() => {
    // Set initial time
    const initialTime = store.getState().playback.currentTime;
    lastFlooredTimeRef.current = Math.floor(initialTime);
    if (timeRef.current) {
      timeRef.current.textContent = formatTimestamp(initialTime);
    }

    // Only update when the floored second changes (formatTimestamp shows whole seconds)
    const unsubscribe = store.subscribe(
      (state) => state.playback.currentTime,
      (time) => {
        const flooredTime = Math.floor(time);
        if (flooredTime !== lastFlooredTimeRef.current) {
          lastFlooredTimeRef.current = flooredTime;
          if (timeRef.current) {
            timeRef.current.textContent = formatTimestamp(time);
          }
        }
      },
    );

    return unsubscribe;
  }, [store]);

  return (
    <div className="font-mono text-muted-foreground text-sm">
      <span ref={timeRef}>
        {formatTimestamp(store.getState().playback.currentTime)}
      </span>{" "}
      / {formatTimestamp(duration)}
    </div>
  );
}

export function TimelineToolbar() {
  const {
    isPlaying,
    isLoading,
    playbackRate,
    zoomLevel,
    zoomIn,
    zoomOut,
    setZoomLevel,
  } = useClippingStore(
    useShallow((s) => ({
      isPlaying: s.playback.isPlaying,
      isLoading: s.playback.isLoading,
      playbackRate: s.playback.playbackRate,
      zoomLevel: s.timeline.zoomLevel,
      zoomIn: s.timeline.zoomIn,
      zoomOut: s.timeline.zoomOut,
      setZoomLevel: s.timeline.setZoomLevel,
    })),
  );

  const { handleNavigateSegment, togglePlayback, setPlaybackRate } =
    usePlayback();

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2">
      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          onClick={() => handleNavigateSegment("prev")}
          size="icon"
          title="Previous segment"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => handleNavigateSegment("next")}
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button
          disabled={zoomLevel <= MIN_ZOOM}
          onClick={zoomOut}
          size="icon"
          variant="ghost"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Slider
          className="w-24"
          max={MAX_ZOOM}
          min={MIN_ZOOM}
          onValueChange={([value]) => value && setZoomLevel(value)}
          step={5}
          value={[zoomLevel]}
        />

        <Button
          disabled={zoomLevel >= MAX_ZOOM}
          onClick={zoomIn}
          size="icon"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <span className="w-12 text-center font-mono text-muted-foreground text-sm">
          {zoomLevel}%
        </span>
      </div>
    </div>
  );
}

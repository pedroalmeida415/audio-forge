"use client";

import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { memo, useEffect, useRef } from "react";
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
import { useClippingWorkspace } from "../../_context/clipping-workspace-context";

const PLAYBACK_RATES = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "2", label: "2x" },
];

// Separate component for time display that updates via subscription
const TimeDisplay = memo(function TimeDisplay() {
  const { audioPlayer } = useClippingWorkspace();
  const { subscribeToTime, getTime, duration } = audioPlayer;
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Set initial time
    if (timeRef.current) {
      timeRef.current.textContent = formatTimestamp(getTime());
    }

    const unsubscribe = subscribeToTime((time) => {
      if (timeRef.current) {
        timeRef.current.textContent = formatTimestamp(time);
      }
    });

    return unsubscribe;
  }, [subscribeToTime, getTime]);

  return (
    <div className="font-mono text-muted-foreground text-sm">
      <span ref={timeRef}>{formatTimestamp(getTime())}</span> /{" "}
      {formatTimestamp(duration)}
    </div>
  );
});

export const TimelineToolbar = memo(function TimelineToolbar() {
  const { audioPlayer, timeline, handleNavigateSegment } =
    useClippingWorkspace();

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
        disabled={audioPlayer.isLoading}
        onClick={audioPlayer.togglePlayback}
        size="icon"
        variant="secondary"
      >
        {audioPlayer.isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Playback speed */}
      <Select
        onValueChange={(value) => audioPlayer.setPlaybackRate(Number(value))}
        value={String(audioPlayer.playbackRate)}
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
          disabled={timeline.zoomLevel <= timeline.minZoom}
          onClick={timeline.zoomOut}
          size="icon"
          variant="ghost"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Slider
          className="w-24"
          max={timeline.maxZoom}
          min={timeline.minZoom}
          onValueChange={([value]) => value && timeline.setZoomLevel(value)}
          step={5}
          value={[timeline.zoomLevel]}
        />

        <Button
          disabled={timeline.zoomLevel >= timeline.maxZoom}
          onClick={timeline.zoomIn}
          size="icon"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <span className="w-12 text-center font-mono text-muted-foreground text-sm">
          {timeline.zoomLevel}%
        </span>
      </div>
    </div>
  );
});

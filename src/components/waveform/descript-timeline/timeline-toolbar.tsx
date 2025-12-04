"use client";

import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { formatTime, ZOOM_PRESETS } from "./timeline-styles";

type TimelineToolbarProps = {
  currentTimeRef: React.RefObject<number>;
  duration: number;
  isPlaying: boolean;
  zoomPercent: number;
  playbackSpeed: number;
  disabled?: boolean;
  onPlayPause: () => void;
  onSeekPrev: () => void;
  onSeekNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomPreset: (percent: number) => void;
  onSpeedChange: (speed: number) => void;
  onSplit?: () => void;
};

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function TimelineToolbar({
  currentTimeRef,
  duration,
  isPlaying,
  zoomPercent,
  playbackSpeed,
  disabled = false,
  onPlayPause,
  onSeekPrev,
  onSeekNext,
  onZoomIn,
  onZoomOut,
  onZoomPreset,
  onSpeedChange,
  onSplit,
}: TimelineToolbarProps) {
  // Refs for direct DOM updates of time display
  const timeMainRef = useRef<HTMLSpanElement>(null);
  const timeDecimalRef = useRef<HTMLSpanElement>(null);

  // Update time display via RAF - bypasses React reconciliation
  useEffect(() => {
    let animationId: number;
    let lastTime = -1;

    const updateTimeDisplay = () => {
      const currentTime = currentTimeRef.current ?? 0;
      // Only update DOM if time actually changed (reduces reflows)
      if (Math.abs(currentTime - lastTime) > 0.01) {
        lastTime = currentTime;
        const formatted = formatTime(currentTime);
        if (timeMainRef.current) {
          timeMainRef.current.textContent = formatted.main;
        }
        if (timeDecimalRef.current) {
          timeDecimalRef.current.textContent = formatted.decimal;
        }
      }
      animationId = requestAnimationFrame(updateTimeDisplay);
    };

    animationId = requestAnimationFrame(updateTimeDisplay);
    return () => cancelAnimationFrame(animationId);
  }, [currentTimeRef]);

  const durationFormatted = formatTime(duration);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-between bg-background px-3 py-2 border-b border-border/50">
        {/* Left section: Navigation and time */}
        <div className="flex flex-1 items-center gap-1">
          {/* Seek controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={onSeekPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Previous segment</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={onSeekNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Next segment</TooltipContent>
          </Tooltip>

          {/* Time display - updated via RAF */}
          <div className="flex items-center gap-0 px-2 tabular-nums font-mono text-sm">
            <span ref={timeMainRef} className="text-foreground">
              0:00
            </span>
            <span ref={timeDecimalRef} className="text-foreground">
              .00
            </span>
            <span className="text-muted-foreground mx-1.5">/</span>
            <span className="text-muted-foreground">
              {durationFormatted.main}
            </span>
            <span className="text-muted-foreground">
              {durationFormatted.decimal}
            </span>
          </div>
        </div>

        {/* Center section: Playback controls */}
        <div className="flex items-center gap-1">
          {/* Play/Pause */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={onPlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isPlaying ? "Pause" : "Play"} (Space)
            </TooltipContent>
          </Tooltip>

          {/* Playback speed */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 tabular-nums font-medium"
                    disabled={disabled}
                  >
                    {playbackSpeed}x
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Playback speed</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="center">
              {PLAYBACK_SPEEDS.map((speed) => (
                <DropdownMenuItem
                  key={speed}
                  onClick={() => onSpeedChange(speed)}
                  className={cn(
                    "tabular-nums",
                    speed === playbackSpeed && "bg-accent"
                  )}
                >
                  {speed}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Split button */}
          {onSplit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  disabled={disabled}
                  onClick={onSplit}
                >
                  <Scissors className="h-4 w-4" />
                  <span className="text-sm">Split</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Split at playhead (S)</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Right section: Zoom controls */}
        <div className="flex flex-1 items-center justify-end gap-1">
          {/* Zoom control group */}
          <div className="flex items-center rounded-md border border-border/50 bg-muted/30">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none rounded-l-md"
                  disabled={disabled || zoomPercent <= 25}
                  onClick={onZoomOut}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Zoom out</TooltipContent>
            </Tooltip>

            {/* Zoom percentage dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 min-w-[52px] rounded-none px-2 tabular-nums text-sm font-medium border-x border-border/50"
                  disabled={disabled}
                >
                  {zoomPercent}%
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {ZOOM_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset.value}
                    onClick={() => onZoomPreset(preset.value)}
                    className={cn(
                      "tabular-nums",
                      preset.value === zoomPercent && "bg-accent"
                    )}
                  >
                    {preset.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none rounded-r-md"
                  disabled={disabled || zoomPercent >= 400}
                  onClick={onZoomIn}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Zoom in</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

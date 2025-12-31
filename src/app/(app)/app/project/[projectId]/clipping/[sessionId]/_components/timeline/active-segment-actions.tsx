"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Check, CheckCircle, Scissors, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
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
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Active segment actions shown in the timeline toolbar.
 *
 * Only visible when `activeSegmentId` is set (single segment clicked).
 * Provides:
 * - Split at playhead
 * - Change speaker (inline dropdown)
 * - Delete segment
 * - Mark as reviewed toggle
 */
export function ActiveSegmentActions() {
  const $store = useClippingStore();

  const activeSegmentId = useValue($store.activeSegmentId);
  const sessionId = useValue($store.sessionId);
  const speakers = useValue($store.speakers);
  const speakerColors = useValue($store.speakerColors);

  const splitSegmentMutation = api.clippingSession.splitSegment.useMutation();
  const updateSegmentsMutation = api.clippingSession.updateSegments.useMutation();

  // Track if split is possible (playhead inside active segment)
  const [canSplit, setCanSplit] = useState(false);

  // Get the active segment's current state
  const activeSegment = useValue(() => {
    const id = $store.activeSegmentId.get();
    if (!id) return null;
    return $store.segments.get().find((s) => s.id === id) ?? null;
  });

  // Track split availability via subscription
  useEffect(() => {
    const dispose = observe(() => {
      const currentActiveId = $store.activeSegmentId.get();
      const currentTime = $store.playback.currentTime.get();

      if (!currentActiveId) {
        setCanSplit(false);
        return;
      }

      const segment = $store.segments
        .get()
        .find((s) => s.id === currentActiveId);
      if (!segment) {
        setCanSplit(false);
        return;
      }

      const isWithinSegment =
        currentTime > segment.start && currentTime < segment.end;
      setCanSplit(isWithinSegment);
    });

    return dispose;
  }, [$store]);

  // Don't render if no active segment
  if (!activeSegmentId || !activeSegment) return null;

  const handleSplit = () => {
    if (!canSplit) return;
    const splitTime = $store.playback.currentTime.peek();
    splitSegmentMutation.mutate({
      sessionId,
      segmentId: activeSegmentId,
      splitTime,
    });
  };

  const handleChangeSpeaker = (speakerId: string) => {
    updateSegmentsMutation.mutate({
      sessionId,
      segmentIds: [activeSegmentId],
      updates: { speakerId },
    });
  };

  const handleDelete = () => {
    updateSegmentsMutation.mutate({
      sessionId,
      segmentIds: [activeSegmentId],
      updates: { isDeleted: true },
    });
    $store.setActiveSegment(null);
  };

  const handleToggleReviewed = () => {
    updateSegmentsMutation.mutate({
      sessionId,
      segmentIds: [activeSegmentId],
      updates: { isReviewed: !activeSegment.isReviewed },
    });
  };

  const currentSpeaker = speakers.find(
    (s) => s.id === activeSegment.speakerId,
  );

  return (
    <div className="flex items-center gap-1 border-l pl-3">
      {/* Split at playhead */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              disabled={!canSplit || splitSegmentMutation.isPending}
              onClick={handleSplit}
              size="icon"
              variant="ghost"
              className="h-8 w-8"
            >
              <Scissors className="h-4 w-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {canSplit
            ? "Split segment at playhead"
            : "Move playhead inside segment to split"}
        </TooltipContent>
      </Tooltip>

      {/* Change speaker dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={updateSegmentsMutation.isPending}
              >
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Change speaker</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          {speakers.map((speaker) => (
            <DropdownMenuItem
              key={speaker.id}
              onClick={() => handleChangeSpeaker(speaker.id)}
              className="flex items-center gap-2"
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: speakerColors[speaker.id] }}
              />
              <span>{speaker.label}</span>
              {speaker.id === activeSegment.speakerId && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete segment */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={updateSegmentsMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete segment</TooltipContent>
      </Tooltip>

      {/* Mark as reviewed toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={activeSegment.isReviewed ? "secondary" : "ghost"}
            className="h-8 w-8"
            onClick={handleToggleReviewed}
            disabled={updateSegmentsMutation.isPending}
          >
            <CheckCircle
              className={`h-4 w-4 ${activeSegment.isReviewed ? "text-green-500" : ""}`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {activeSegment.isReviewed ? "Mark as unreviewed" : "Mark as reviewed"}
        </TooltipContent>
      </Tooltip>

      {/* Speaker indicator */}
      {currentSpeaker && (
        <div className="ml-2 flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: speakerColors[activeSegment.speakerId] }}
          />
          <span className="max-w-[100px] truncate text-muted-foreground text-xs">
            {currentSpeaker.label}
          </span>
        </div>
      )}
    </div>
  );
}

"use client";

import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Check, Plus, Scissors, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { CreateSpeakerDialog } from "~/features/clipping/components/dialogs/create-speaker-dialog";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

/**
 * Active segment actions shown in the timeline toolbar.
 *
 * Only visible when `activeSegmentId` is set (single segment clicked).
 * Provides:
 * - Split at playhead
 * - Change speaker (inline dropdown)
 * - Delete segment
 */
export function ActiveSegmentActions() {
  const $store = useClippingStore();

  const activeSegmentId = useValue($store.activeSegmentId);
  const sessionId = useValue($store.sessionId);
  const speakers = useValue($store.speakers);

  const splitSegmentMutation = api.segment.splitSegment.useMutation();
  const updateSegmentsMutation = api.segment.updateSegments.useMutation();
  const promoteLocalSegmentsMutation =
    api.segment.promoteLocalSegments.useMutation();
  const deleteSegmentsMutation = api.segment.deleteSegments.useMutation();

  // Track if split is possible (playhead inside active segment)
  const [canSplit, setCanSplit] = useState(false);
  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);

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
        currentTime > segment.startTime && currentTime < segment.endTime;
      setCanSplit(isWithinSegment);
    });

    return dispose;
  }, [$store]);

  // Don't render if no active segment
  if (!activeSegmentId || !activeSegment) return null;

  // Check if segment is local (from diarization, not yet promoted to project)
  const isLocalSegment = activeSegment.source === "local";

  const handleSplit = () => {
    if (!canSplit || isLocalSegment) return;
    const splitTime = $store.playback.currentTime.peek();
    splitSegmentMutation.mutate({
      sessionId,
      segmentId: activeSegmentId,
      splitTime,
    });
  };

  const handleChangeSpeaker = (speakerId: string) => {
    // Get the target speaker to check its source
    const targetSpeaker = speakers.find((s) => s.id === speakerId);

    if (isLocalSegment && targetSpeaker?.source === "project") {
      // Local segment being assigned to a project speaker -> promote
      promoteLocalSegmentsMutation.mutate({
        sessionId,
        localSegmentIds: [activeSegmentId],
        targetSpeakerId: speakerId,
      });
    } else if (!isLocalSegment) {
      // Project segment speaker change
      updateSegmentsMutation.mutate({
        sessionId,
        segmentIds: [activeSegmentId],
        updates: { speakerId },
      });
    }
    // Note: Local segment to local speaker is not allowed by the design
  };

  const handleSpeakerCreated = (newSpeakerId: string) => {
    // Assign active segment to the newly created speaker
    handleChangeSpeaker(newSpeakerId);
  };

  const handleDelete = () => {
    if (isLocalSegment) return; // Local segments cannot be deleted
    deleteSegmentsMutation.mutate({
      sessionId,
      segmentIds: [activeSegmentId],
    });
    $store.setActiveSegment(null);
  };

  const currentSpeaker = speakers.find((s) => s.id === activeSegment.speakerId);

  // Always show only project speakers as change targets
  const projectSpeakers = speakers.filter((s) => s.source === "project");

  return (
    <div
      data-testid="active-segment-actions"
      className="flex items-center gap-1 border-l pl-3"
    >
      {/* Split at playhead */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              aria-label="Split segment"
              disabled={
                isLocalSegment || !canSplit || splitSegmentMutation.isPending
              }
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
          {isLocalSegment
            ? "Local segments cannot be split"
            : canSplit
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
                aria-label="Change speaker"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={
                  updateSegmentsMutation.isPending ||
                  promoteLocalSegmentsMutation.isPending
                }
              >
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Change speaker</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          {projectSpeakers.map((speaker) => (
            <DropdownMenuItem
              key={speaker.id}
              onClick={() => handleChangeSpeaker(speaker.id)}
              className="flex items-center gap-2"
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: speaker.color }}
              />
              <span>{speaker.name}</span>
              {speaker.id === activeSegment.speakerId && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
          {projectSpeakers.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() => setIsCreateSpeakerOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-3 w-3" />
            <span>Create new speaker...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete segment */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              aria-label="Delete segment"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={isLocalSegment || deleteSegmentsMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isLocalSegment ? "Local segments cannot be deleted" : "Delete segment"}
        </TooltipContent>
      </Tooltip>

      {/* Speaker indicator */}
      {currentSpeaker && (
        <div
          data-testid="active-segment-speaker"
          className="ml-2 flex items-center gap-1.5 rounded-md bg-muted px-2 py-1"
        >
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: currentSpeaker.color }}
          />
          <span className="max-w-[100px] truncate text-muted-foreground text-xs">
            {currentSpeaker.name}
          </span>
        </div>
      )}

      {/* Create speaker dialog */}
      <CreateSpeakerDialog
        open={isCreateSpeakerOpen}
        onOpenChange={setIsCreateSpeakerOpen}
        onSpeakerCreated={handleSpeakerCreated}
      />
    </div>
  );
}

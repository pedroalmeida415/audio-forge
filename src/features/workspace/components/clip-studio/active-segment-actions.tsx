"use client";

import { Check, Plus, Scissors, Trash2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { effect } from "valtio-reactive";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import {
  useWorkspaceCreateSpeakerMutation,
  useWorkspaceDeleteSegmentsMutation,
  useWorkspaceSplitSegmentMutation,
  useWorkspaceUpdateSegmentsMutation,
} from "~/features/workspace/hooks/use-workspace-mutations";
import type { Segment, Speaker } from "~/server/db/schema";

interface ActiveSegmentActionsProps {
  segments: Segment[];
  speakers: Speaker[];
  sourceId: string;
  projectId: string;
  activeSegmentId: string | null;
  onActiveSegmentChange: (segmentId: string | null) => void;
}

/**
 * Active segment actions shown in the timeline toolbar.
 *
 * Only visible when `activeSegmentId` is set (single segment clicked).
 * Provides:
 * - Split at playhead
 * - Change speaker (inline dropdown)
 * - Delete segment
 */
export function ActiveSegmentActions({
  segments,
  speakers,
  sourceId,
  projectId,
  activeSegmentId,
  onActiveSegmentChange,
}: ActiveSegmentActionsProps) {
  const { store } = useWorkspaceStore();

  const splitSegmentMutation = useWorkspaceSplitSegmentMutation();
  const updateSegmentsMutation = useWorkspaceUpdateSegmentsMutation();
  const deleteSegmentsMutation = useWorkspaceDeleteSegmentsMutation();

  // Track if split is possible (playhead inside active segment)
  const [canSplit, setCanSplit] = useState(false);
  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);

  // Get the active segment's current state
  const activeSegment = activeSegmentId
    ? (segments.find((s) => s.id === activeSegmentId) ?? null)
    : null;

  // Track split availability via effect()
  useEffect(() => {
    const dispose = effect(() => {
      const currentTime = store.currentTime;

      if (!activeSegmentId) {
        setCanSplit(false);
        return;
      }

      const segment = segments.find((s) => s.id === activeSegmentId);
      if (!segment) {
        setCanSplit(false);
        return;
      }

      const isWithinSegment =
        currentTime > segment.startTime && currentTime < segment.endTime;
      setCanSplit(isWithinSegment);
    });

    return dispose;
  }, [store, segments, activeSegmentId]);

  // Don't render if no active segment
  if (!activeSegmentId || !activeSegment) return null;

  const handleSplit = () => {
    if (!canSplit) return;
    const splitTime = store.currentTime;
    splitSegmentMutation.mutate({
      sourceId,
      segmentId: activeSegmentId,
      splitTime,
    });
  };

  const handleChangeSpeaker = (speakerId: string) => {
    updateSegmentsMutation.mutate({
      sourceId,
      segmentIds: [activeSegmentId],
      updates: { speakerId },
    });
  };

  const handleSpeakerCreated = (newSpeakerId: string) => {
    // Assign active segment to the newly created speaker
    handleChangeSpeaker(newSpeakerId);
  };

  const handleDelete = () => {
    deleteSegmentsMutation.mutate({
      sourceId,
      segmentIds: [activeSegmentId],
    });
    onActiveSegmentChange(null);
  };

  const currentSpeaker = speakers.find((s) => s.id === activeSegment.speakerId);

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
                aria-label="Change speaker"
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
                style={{ backgroundColor: speaker.color }}
              />
              <span>{speaker.name}</span>
              {speaker.id === activeSegment.speakerId && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
          {speakers.length > 0 && <DropdownMenuSeparator />}
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
              disabled={deleteSegmentsMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Delete segment</TooltipContent>
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

      {/* Create speaker dialog (inline, no dependency on clipping store) */}
      <CreateSpeakerInlineDialog
        open={isCreateSpeakerOpen}
        onOpenChange={setIsCreateSpeakerOpen}
        onSpeakerCreated={handleSpeakerCreated}
        sourceId={sourceId}
        projectId={projectId}
        speakerCount={speakers.length}
      />
    </div>
  );
}

/**
 * Inline create-speaker dialog that takes projectId as a prop
 * instead of reading from a Legend-State store.
 */
function CreateSpeakerInlineDialog({
  open,
  onOpenChange,
  onSpeakerCreated,
  sourceId,
  projectId,
  speakerCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpeakerCreated?: (speakerId: string) => void;
  sourceId: string;
  projectId: string;
  speakerCount: number;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const createSpeakerMutation = useWorkspaceCreateSpeakerMutation(sourceId, {
    onSuccess: (result) => {
      if (result.speaker) {
        onSpeakerCreated?.(result.speaker.id);
      }
      onOpenChange(false);
      setName("");
    },
  });

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      const timeout = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const defaultName = `Speaker ${speakerCount + 1}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || defaultName;
    createSpeakerMutation.mutate({
      projectId,
      name: trimmedName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Speaker</DialogTitle>
            <DialogDescription>
              Enter a name for the new speaker.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              disabled={createSpeakerMutation.isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createSpeakerMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createSpeakerMutation.isPending}>
              {createSpeakerMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

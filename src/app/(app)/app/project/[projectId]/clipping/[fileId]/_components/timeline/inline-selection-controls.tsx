"use client";

import { useSelector, useValue } from "@legendapp/state/react";
import { Play, Plus, UserPlus } from "lucide-react";
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
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Formats time in MM:SS.mmm format
 */
function formatTimeWithMs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

/**
 * Inline selection controls shown in the timeline toolbar.
 *
 * Only visible when selection mode is 'active' (drag-to-select completed).
 * Provides:
 * - Time range display (MM:SS.mmm - MM:SS.mmm)
 * - Speaker picker with inline "Create new" option
 * - Play selection button
 * - Create segment button
 *
 * Replaces the floating portal-based SelectionControls component.
 */
export function InlineSelectionControls() {
  const $store = useClippingStore();

  const fileId = useSelector(() => $store.fileId.get());
  const mode = useSelector(() => $store.selection.mode.get());
  const range = useSelector(() => $store.selection.getSelectionRange.get());
  const speakers = useSelector(() => $store.speakers.get());
  const speakerColors = useSelector(() => $store.speakerColors.get());

  // Get selected speaker: selection's speaker or fall back to currently selected speaker
  const selectedSpeakerId = useSelector(() => {
    const selectionSpeaker = $store.selection.selectedSpeaker.get();
    return selectionSpeaker ?? $store.selectedSpeakerId.get() ?? "";
  });

  const createSegmentMutation = api.file.createSegment.useMutation();
  const createSpeakerMutation = api.file.createSpeaker.useMutation();

  // Don't render if not in active selection mode
  if (mode !== "active" || !range) return null;

  const handlePlaySelection = () => {
    if (range) {
      $store.playback.playSegment(range.start, range.end);
    }
  };

  const handleSpeakerChange = (speakerId: string) => {
    $store.selection.setSelectedSpeaker(speakerId);
  };

  const handleCreateSpeaker = () => {
    // Generate a unique label
    const existingLabels = speakers.map((s) => s.label);
    let labelNum = speakers.length;
    let newLabel: string;
    do {
      newLabel = `SPEAKER_${String(labelNum).padStart(2, "0")}`;
      labelNum++;
    } while (existingLabels.includes(newLabel));

    createSpeakerMutation.mutate(
      { fileId, label: newLabel },
      {
        onSuccess: (newSpeaker) => {
          $store.selection.setSelectedSpeaker(newSpeaker.id);
        },
      },
    );
  };

  const handleCreateSegment = () => {
    if (!range || !selectedSpeakerId) return;

    createSegmentMutation.mutate({
      fileId,
      segment: {
        speakerId: selectedSpeakerId,
        start: range.start,
        end: range.end,
      },
    });
  };

  const handleCancel = () => {
    $store.selection.cancelSelection();
  };

  const selectedSpeaker = speakers.find((s) => s.id === selectedSpeakerId);

  return (
    <div className="flex items-center gap-2 border-l pl-3">
      {/* Time range display */}
      <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
        <span>{formatTimeWithMs(range.start)}</span>
        <span className="text-muted-foreground/60">→</span>
        <span>{formatTimeWithMs(range.end)}</span>
      </div>

      {/* Speaker picker dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-w-[140px] justify-start gap-2"
          >
            {selectedSpeaker ? (
              <>
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: speakerColors[selectedSpeakerId] }}
                />
                <span className="truncate">{selectedSpeaker.label}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Select speaker</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px]">
          {speakers.map((speaker) => (
            <DropdownMenuItem
              key={speaker.id}
              onClick={() => handleSpeakerChange(speaker.id)}
              className="flex items-center gap-2"
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: speakerColors[speaker.id] }}
              />
              <span>{speaker.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleCreateSpeaker}
            className="flex items-center gap-2"
            disabled={createSpeakerMutation.isPending}
          >
            <UserPlus className="h-4 w-4" />
            <span>Create new speaker</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Play selection button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handlePlaySelection}
          >
            <Play className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Play selection</TooltipContent>
      </Tooltip>

      {/* Create segment button */}
      <Button
        size="sm"
        className="h-8"
        onClick={handleCreateSegment}
        disabled={!selectedSpeakerId || createSegmentMutation.isPending}
      >
        <Plus className="mr-1 h-4 w-4" />
        Create
      </Button>

      {/* Cancel button */}
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={handleCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

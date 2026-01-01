"use client";

import { useSelector } from "@legendapp/state/react";
import { Check, ChevronsUpDown, Play, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
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
 * - Speaker combobox (select existing or type to create new)
 * - Play selection button
 * - Create segment button
 */
export function InlineSelectionControls() {
  const $store = useClippingStore();

  const sessionId = useSelector(() => $store.sessionId.get());
  const projectId = useSelector(() => $store.projectId.get());
  const mode = useSelector(() => $store.selection.mode.get());
  const range = useSelector(() => $store.selection.getSelectionRange.get());
  const speakers = useSelector(() => $store.speakers.get());
  const speakerColors = useSelector(() => $store.speakerColors.get());

  // Get selected speaker: selection's speaker or fall back to currently selected speaker
  const selectedSpeakerId = useSelector(() => {
    const selectionSpeaker = $store.selection.selectedSpeaker.get();
    return selectionSpeaker ?? $store.selectedSpeakerId.get() ?? "";
  });

  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const createSegmentMutation = api.clippingSession.createSegment.useMutation();
  const createSpeakerMutation = api.clippingSession.createSpeaker.useMutation();

  // Don't render if not in active selection mode
  if (mode !== "active" || !range) return null;

  const handlePlaySelection = () => {
    if (range) {
      $store.playback.playSegment(range.start, range.end);
    }
  };

  const handleSpeakerSelect = (speakerId: string) => {
    $store.selection.setSelectedSpeaker(speakerId);
    setOpen(false);
    setSearchValue("");
  };

  const handleCreateSpeaker = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createSpeakerMutation.mutate(
      { projectId, name: trimmed },
      {
        onSuccess: (result) => {
          if (result.speaker) {
            $store.selection.setSelectedSpeaker(result.speaker.id);
          }
        },
      },
    );
    setOpen(false);
    setSearchValue("");
  };

  const handleCreateSegment = () => {
    if (!range || !selectedSpeakerId) return;

    createSegmentMutation.mutate({
      sessionId,
      segment: {
        speakerId: selectedSpeakerId,
        startTime: range.start,
        endTime: range.end,
      },
    });
  };

  const handleCancel = () => {
    $store.selection.cancelSelection();
  };

  const selectedSpeaker = speakers.find((s) => s.id === selectedSpeakerId);

  // Check if search matches any existing speaker
  const searchMatchesExisting = speakers.some(
    (s) => s.name.toLowerCase() === searchValue.toLowerCase().trim(),
  );

  return (
    <div className="flex items-center gap-2 border-l pl-3">
      {/* Time range display */}
      <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
        <span>{formatTimeWithMs(range.start)}</span>
        <span className="text-muted-foreground/60">→</span>
        <span>{formatTimeWithMs(range.end)}</span>
      </div>

      {/* Speaker combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-[160px] justify-between"
          >
            {selectedSpeaker ? (
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: speakerColors[selectedSpeakerId] }}
                />
                <span className="truncate">{selectedSpeaker.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select speaker...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or create..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>
                {searchValue.trim() ? (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => handleCreateSpeaker(searchValue)}
                    disabled={createSpeakerMutation.isPending}
                  >
                    <Plus className="h-4 w-4" />
                    Create "{searchValue.trim()}"
                  </button>
                ) : (
                  "No speakers found."
                )}
              </CommandEmpty>
              <CommandGroup>
                {speakers.map((speaker) => (
                  <CommandItem
                    key={speaker.id}
                    value={speaker.name}
                    onSelect={() => handleSpeakerSelect(speaker.id)}
                  >
                    <div
                      className="mr-2 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: speakerColors[speaker.id] }}
                    />
                    <span>{speaker.name}</span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selectedSpeakerId === speaker.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
                {/* Show create option if search doesn't match existing */}
                {searchValue.trim() && !searchMatchesExisting && (
                  <CommandItem
                    value={`create-${searchValue}`}
                    onSelect={() => handleCreateSpeaker(searchValue)}
                    disabled={createSpeakerMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{searchValue.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

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
      <Button size="sm" variant="ghost" className="h-8" onClick={handleCancel}>
        Cancel
      </Button>
    </div>
  );
}

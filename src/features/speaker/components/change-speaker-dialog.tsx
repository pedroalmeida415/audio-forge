"use client";

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface ChangeSpeakerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentIds?: string[];
  excludeSegmentIds?: string[];
  segmentCount: number;
  projectId: string;
  speakerId: string;
  speakerName: string;
  onSuccess: (data: { updatedCount: number }) => void;
}

export function ChangeSpeakerDialog({
  open,
  onOpenChange,
  segmentIds,
  excludeSegmentIds,
  segmentCount,
  projectId,
  speakerId,
  speakerName,
  onSuccess,
}: ChangeSpeakerDialogProps) {
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(
    null,
  );
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Fetch project speakers (excludes source-linked diarization speakers)
  const { data: speakers, isLoading: isLoadingSpeakers } =
    api.speaker.getAllByProjectId.useQuery({ projectId }, { enabled: open });

  // Change speaker mutation
  const changeSpeakerMutation = api.segment.changeSpeaker.useMutation({
    onSuccess: (data) => {
      onSuccess(data);
      onOpenChange(false);
      setSelectedSpeakerId(null);
    },
  });

  // Filter out current speaker from the list
  const availableSpeakers = speakers?.filter((s) => s.id !== speakerId) ?? [];

  const selectedSpeaker = availableSpeakers.find(
    (s) => s.id === selectedSpeakerId,
  );

  const handleSubmit = () => {
    if (!selectedSpeakerId) return;

    changeSpeakerMutation.mutate({
      speakerId,
      segmentIds,
      excludeSegmentIds,
      targetSpeakerId: selectedSpeakerId,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedSpeakerId(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Speaker</DialogTitle>
          <DialogDescription>
            Move {segmentCount} segment{segmentCount !== 1 ? "s" : ""} from{" "}
            <span className="font-medium">{speakerName}</span> to another
            speaker.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboboxOpen}
                className="w-full justify-between"
                disabled={isLoadingSpeakers}
              >
                {isLoadingSpeakers ? (
                  <span className="text-muted-foreground">
                    Loading speakers...
                  </span>
                ) : selectedSpeaker ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="size-3 rounded-full"
                      style={{
                        backgroundColor: selectedSpeaker.color ?? "#888",
                      }}
                    />
                    {selectedSpeaker.name}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    Select a speaker...
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search speakers..." />
                <CommandList>
                  <CommandEmpty>No speakers found.</CommandEmpty>
                  <CommandGroup>
                    {availableSpeakers.map((speaker) => (
                      <CommandItem
                        key={speaker.id}
                        value={speaker.name}
                        onSelect={() => {
                          setSelectedSpeakerId(speaker.id);
                          setComboboxOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 rounded-full"
                            style={{ backgroundColor: speaker.color ?? "#888" }}
                          />
                          {speaker.name}
                        </div>
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
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {availableSpeakers.length === 0 && !isLoadingSpeakers && (
            <p className="text-muted-foreground text-sm">
              No other speakers available in this project. Create a new speaker
              from the project page first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={changeSpeakerMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedSpeakerId || changeSpeakerMutation.isPending}
          >
            {changeSpeakerMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Moving...
              </>
            ) : (
              "Move Segments"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

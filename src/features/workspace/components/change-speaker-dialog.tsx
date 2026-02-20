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
  sourceId?: string | null;
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
  sourceId,
  speakerId,
  speakerName,
  onSuccess,
}: ChangeSpeakerDialogProps) {
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(
    null,
  );
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const utils = api.useUtils();

  // Fetch project speakers (excludes source-linked diarization speakers)
  const { data: speakers, isLoading: isLoadingSpeakers } =
    api.speaker.getByProject.useQuery({ projectId }, { enabled: open });

  const updateManyMutation = api.segment.updateMany.useMutation();
  const updateSourceSegmentsMutation = api.source.updateSegments.useMutation();
  const updateSpeakerSegmentsMutation =
    api.speaker.updateSegments.useMutation();
  const isMoving =
    updateManyMutation.isPending ||
    updateSourceSegmentsMutation.isPending ||
    updateSpeakerSegmentsMutation.isPending;

  // Filter out current speaker from the list
  const availableSpeakers = speakers?.filter((s) => s.id !== speakerId) ?? [];

  const selectedSpeaker = availableSpeakers.find(
    (s) => s.id === selectedSpeakerId,
  );

  const invalidateSegmentQueries = async (targetSpeakerId: string) => {
    const invalidations: Promise<unknown>[] = [];

    if (sourceId) {
      invalidations.push(utils.segment.getBySource.invalidate({ sourceId }));
    }

    invalidations.push(utils.segment.getBySpeaker.invalidate({ speakerId }));
    if (targetSpeakerId !== speakerId) {
      invalidations.push(
        utils.segment.getBySpeaker.invalidate({ speakerId: targetSpeakerId }),
      );
    }

    await Promise.all(invalidations);
  };

  const handleSubmit = () => {
    if (!selectedSpeakerId) return;
    const targetSpeakerId = selectedSpeakerId;

    void (async () => {
      try {
        if (segmentIds && segmentIds.length > 0) {
          const data = await updateManyMutation.mutateAsync({
            segmentIds,
            patch: { speakerId: targetSpeakerId },
          });
          onSuccess(data);
        } else if (sourceId) {
          const data = await updateSourceSegmentsMutation.mutateAsync({
            sourceId,
            speakerId,
            excludeSegmentIds,
            patch: { speakerId: targetSpeakerId },
          });
          onSuccess(data);
        } else {
          const data = await updateSpeakerSegmentsMutation.mutateAsync({
            speakerId,
            excludeSegmentIds,
            patch: { speakerId: targetSpeakerId },
          });
          onSuccess(data);
        }

        onOpenChange(false);
        setSelectedSpeakerId(null);
      } catch {
        // Keep dialog open so the user can retry.
      } finally {
        await invalidateSegmentQueries(targetSpeakerId);
      }
    })();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedSpeakerId(null);
      setComboboxOpen(false);
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
                disabled={isLoadingSpeakers || isMoving}
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
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedSpeakerId || isMoving}
          >
            {isMoving ? (
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

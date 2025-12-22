"use client";

import { useValue } from "@legendapp/state/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import {
  getSpeakerDisplayName,
  getUniqueSpeakers,
} from "../../_utils/segment-utils";

interface ChangeSpeakerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetSegmentIds: string[];
}

export function ChangeSpeakerDialog({
  open,
  onOpenChange,
  targetSegmentIds,
}: ChangeSpeakerDialogProps) {
  const $store = useClippingStore();

  const segments = useValue($store.segments);
  const speakerCollections = useValue($store.speakerCollections);
  const diarizationId = useValue($store.diarizationId);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

  // Get all unique speakers from segments
  const speakers = getUniqueSpeakers(segments);
  const speakerColors = useValue($store.speakerColors);

  const handleSelectSpeaker = (speaker: string) => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: targetSegmentIds,
      updates: { speaker },
    });
    $store.clearAllSelected();
    onOpenChange(false);
  };

  const segmentCount = targetSegmentIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Speaker</DialogTitle>
          <DialogDescription>
            Select a speaker to assign to{" "}
            {segmentCount === 1 ? "this segment" : `${segmentCount} segments`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="grid gap-2 py-2 pr-4">
            {speakers.map((speaker) => {
              const displayName = getSpeakerDisplayName(
                speaker,
                speakerCollections,
              );

              return (
                <button
                  key={speaker}
                  type="button"
                  onClick={() => handleSelectSpeaker(speaker)}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: speakerColors[speaker] }}
                  />
                  <span className="font-medium">{displayName}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

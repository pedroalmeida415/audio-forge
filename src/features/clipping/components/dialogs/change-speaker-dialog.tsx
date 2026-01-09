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
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

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

  const speakers = useValue($store.speakers);
  const sessionId = useValue($store.sessionId);

  const updateSegmentsMutation =
    api.clippingSession.updateSegments.useMutation();

  const handleSelectSpeaker = (speakerId: string) => {
    updateSegmentsMutation.mutate({
      sessionId,
      segmentIds: targetSegmentIds,
      updates: { speakerId },
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
            {speakers.map((speaker) => (
              <button
                key={speaker.id}
                type="button"
                onClick={() => handleSelectSpeaker(speaker.id)}
                className="flex items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: speaker.color }}
                />
                <span className="font-medium">{speaker.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

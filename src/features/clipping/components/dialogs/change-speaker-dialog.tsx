"use client";

import { useValue } from "@legendapp/state/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { CreateSpeakerDialog } from "~/features/clipping/components/dialogs/create-speaker-dialog";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

interface ChangeSpeakerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeSpeakerDialog({
  open,
  onOpenChange,
}: ChangeSpeakerDialogProps) {
  const $store = useClippingStore();

  const speakers = useValue($store.speakers);
  const sourceId = useValue($store.sourceId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);

  const updateSegmentsMutation = api.segment.updateSegments.useMutation();

  const handleSelectSpeaker = (speakerId: string) => {
    // Get current segment IDs at mutation time
    const targetIds = Array.from(selectedSegmentIds);
    if (targetIds.length === 0) return;

    updateSegmentsMutation.mutate({
      sourceId,
      segmentIds: targetIds,
      updates: { speakerId },
    });

    $store.clearAllSelected();
    onOpenChange(false);
  };

  const handleSpeakerCreated = (newSpeakerId: string) => {
    // Assign selected segments to the newly created speaker
    handleSelectSpeaker(newSpeakerId);
  };

  const segmentCount = selectedSegmentIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Speaker</DialogTitle>
          <DialogDescription>
            Select a speaker to assign to{" "}
            {segmentCount === 1
              ? "this segment"
              : `${segmentCount} segments`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="grid gap-2 py-2 pr-4">
            {speakers.map((speaker) => (
              <Button
                key={speaker.id}
                variant="outline"
                onClick={() => handleSelectSpeaker(speaker.id)}
                className="h-auto justify-start gap-3 border-border/50 p-3"
              >
                <div
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: speaker.color }}
                />
                <span className="font-medium">{speaker.name}</span>
              </Button>
            ))}

            {/* Create new speaker option */}
            <Button
              variant="outline"
              onClick={() => setIsCreateSpeakerOpen(true)}
              className="h-auto justify-start gap-3 border-border/50 border-dashed p-3 text-muted-foreground hover:border-border hover:text-foreground"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="font-medium">Create new speaker...</span>
            </Button>
          </div>
        </ScrollArea>

        {/* Create speaker dialog */}
        <CreateSpeakerDialog
          open={isCreateSpeakerOpen}
          onOpenChange={setIsCreateSpeakerOpen}
          onSpeakerCreated={handleSpeakerCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

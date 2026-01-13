"use client";

import { useValue } from "@legendapp/state/react";
import { Plus } from "lucide-react";
import { useState } from "react";
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
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const sessionId = useValue($store.sessionId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);

  const updateSegmentsMutation =
    api.clippingSession.updateSegments.useMutation();
  const promoteLocalSegmentsMutation =
    api.clippingSession.promoteLocalSegments.useMutation();

  // Check if current speaker is local - all selected segments belong to this speaker
  const currentSpeaker = speakers.find((s) => s.id === selectedSpeakerId);
  const isLocalSpeaker = currentSpeaker?.source === "local";

  // Always show only project speakers as targets
  const projectSpeakers = speakers.filter((s) => s.source === "project");

  const handleSelectSpeaker = (speakerId: string) => {
    // Get current segment IDs at mutation time
    const targetIds = Array.from(selectedSegmentIds);
    if (targetIds.length === 0) return;

    if (isLocalSpeaker) {
      // Promote local segments to project level
      promoteLocalSegmentsMutation.mutate({
        sessionId,
        localSegmentIds: targetIds,
        targetSpeakerId: speakerId,
      });
    } else {
      // Update project segments
      updateSegmentsMutation.mutate({
        sessionId,
        segmentIds: targetIds,
        updates: { speakerId },
      });
    }

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
          <DialogTitle>
            {isLocalSpeaker ? "Assign to Project Speaker" : "Change Speaker"}
          </DialogTitle>
          <DialogDescription>
            {isLocalSpeaker ? (
              <>
                Select a project speaker to assign to{" "}
                {segmentCount === 1 ? "this segment" : `${segmentCount} segments`}
                . Local segments will be promoted to project level.
              </>
            ) : (
              <>
                Select a speaker to assign to{" "}
                {segmentCount === 1 ? "this segment" : `${segmentCount} segments`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="grid gap-2 py-2 pr-4">
            {projectSpeakers.map((speaker) => (
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

            {/* Create new speaker option */}
            <button
              type="button"
              onClick={() => setIsCreateSpeakerOpen(true)}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border/50 p-3 text-left text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="font-medium">Create new speaker...</span>
            </button>
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

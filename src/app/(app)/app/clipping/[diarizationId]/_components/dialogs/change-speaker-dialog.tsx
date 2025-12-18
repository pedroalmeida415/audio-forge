"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { getSpeakerColor } from "~/lib/speaker-colors";
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
  const segmentsById = useClippingStore((s) => s.segments.segmentsById);
  const speakerCollections = useClippingStore(
    (s) => s.segments.speakerCollections,
  );
  const diarizationId = useClippingStore((s) => s.segments.diarizationId);
  const clearSelection = useClippingStore((s) => s.segments.clearSelection);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

  // Get all unique speakers from segments
  const speakers = getUniqueSpeakers(Object.values(segmentsById));

  // Create speaker index map for colors
  const speakerIndexMap = new Map(speakers.map((s, i) => [s, i]));

  const handleSelectSpeaker = (speaker: string) => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: targetSegmentIds,
      updates: { speaker },
    });
    clearSelection();
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

        <div className="grid gap-2 py-2">
          {speakers.map((speaker) => {
            const colorIndex = speakerIndexMap.get(speaker) ?? 0;
            const color = getSpeakerColor(colorIndex);
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
                  style={{ backgroundColor: color.border }}
                />
                <span className="font-medium">{displayName}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

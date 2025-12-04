"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { cn } from "~/lib/utils";
import type { DiarizationSegment } from "~/server/db/schema";

type ReassignSpeakerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: DiarizationSegment | null;
  existingSpeakers: string[];
  onReassign: (segmentId: string, newSpeaker: string) => Promise<void>;
  isReassigning: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

export function ReassignSpeakerDialog({
  open,
  onOpenChange,
  segment,
  existingSpeakers,
  onReassign,
  isReassigning,
}: ReassignSpeakerDialogProps) {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [useNewSpeaker, setUseNewSpeaker] = useState(false);

  // Filter out current speaker from options
  const otherSpeakers = existingSpeakers.filter((s) => s !== segment?.speaker);

  const handleReassign = async () => {
    if (!segment) return;

    const targetSpeaker = useNewSpeaker
      ? newSpeakerName.trim()
      : selectedSpeaker;

    if (!targetSpeaker) return;

    await onReassign(segment.id, targetSpeaker);
    onOpenChange(false);
    // Reset state
    setSelectedSpeaker(null);
    setNewSpeakerName("");
    setUseNewSpeaker(false);
  };

  const canReassign =
    (useNewSpeaker && newSpeakerName.trim().length > 0) ||
    (!useNewSpeaker && selectedSpeaker);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Segment</DialogTitle>
          <DialogDescription>
            Move this segment to a different speaker group.
          </DialogDescription>
        </DialogHeader>

        {segment && (
          <div className="space-y-4 py-4">
            {/* Current segment info */}
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground text-xs uppercase tracking-wide">
                Current
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 font-medium text-sm">
                  {segment.speaker}
                </span>
                <span className="font-mono text-muted-foreground text-sm">
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </span>
              </div>
            </div>

            {/* Speaker selection */}
            <div className="space-y-3">
              <Label>Move to speaker:</Label>

              <RadioGroup
                onValueChange={(value) => {
                  if (value === "__new__") {
                    setUseNewSpeaker(true);
                    setSelectedSpeaker(null);
                  } else {
                    setUseNewSpeaker(false);
                    setSelectedSpeaker(value);
                  }
                }}
                value={
                  useNewSpeaker ? "__new__" : (selectedSpeaker ?? undefined)
                }
              >
                {/* Existing speakers */}
                {otherSpeakers.map((speaker) => (
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 transition-colors",
                      selectedSpeaker === speaker &&
                        !useNewSpeaker &&
                        "border-primary bg-primary/5"
                    )}
                    key={speaker}
                  >
                    <RadioGroupItem id={speaker} value={speaker} />
                    <Label className="flex-1 cursor-pointer" htmlFor={speaker}>
                      {speaker}
                    </Label>
                  </div>
                ))}

                {/* Divider */}
                {otherSpeakers.length > 0 && (
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        or create new
                      </span>
                    </div>
                  </div>
                )}

                {/* New speaker option */}
                <div
                  className={cn(
                    "space-y-2 rounded-md border p-3 transition-colors",
                    useNewSpeaker && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem id="new-speaker" value="__new__" />
                    <Label className="cursor-pointer" htmlFor="new-speaker">
                      New speaker
                    </Label>
                  </div>
                  {useNewSpeaker && (
                    <Input
                      className="mt-2"
                      onChange={(e) => setNewSpeakerName(e.target.value)}
                      placeholder="Enter speaker name (e.g., SPEAKER_05)"
                      value={newSpeakerName}
                    />
                  )}
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={isReassigning}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canReassign || isReassigning}
            onClick={handleReassign}
          >
            {isReassigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

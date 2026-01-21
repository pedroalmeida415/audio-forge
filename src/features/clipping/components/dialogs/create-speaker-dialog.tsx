"use client";

import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
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
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

interface CreateSpeakerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when speaker is successfully created.
   * Receives the new speaker's ID.
   */
  onSpeakerCreated?: (speakerId: string) => void;
}

export function CreateSpeakerDialog({
  open,
  onOpenChange,
  onSpeakerCreated,
}: CreateSpeakerDialogProps) {
  const $store = useClippingStore();
  const projectId = useValue($store.projectId);
  const speakers = useValue($store.speakers);

  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const createSpeakerMutation = api.speaker.createSpeaker.useMutation({
    onSuccess: (result) => {
      if (result.speaker) {
        onSpeakerCreated?.(result.speaker.id);
      }
      onOpenChange(false);
      setName("");
    },
  });

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      // Reset name field
      setName("");
      // Focus with a small delay to let the dialog animate in
      const timeout = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Generate default name suggestion
  const defaultName = `Speaker ${speakers.filter((s) => s.source === "project").length + 1}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || defaultName;
    createSpeakerMutation.mutate({
      projectId,
      name: trimmedName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Speaker</DialogTitle>
            <DialogDescription>
              Enter a name for the new speaker.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              disabled={createSpeakerMutation.isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createSpeakerMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createSpeakerMutation.isPending}>
              {createSpeakerMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

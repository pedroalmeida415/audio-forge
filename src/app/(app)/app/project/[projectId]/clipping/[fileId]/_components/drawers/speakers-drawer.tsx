"use client";

import { useSelector, useValue } from "@legendapp/state/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Speakers drawer - slide-out panel for managing workspace speakers.
 * - Lists all speakers with color dots
 * - Hover reveals edit/delete actions
 * - Click speaker to select and filter table
 * - Create new speaker at bottom
 */
export function SpeakersDrawer() {
  const $store = useClippingStore();
  const isOpen = useValue($store.isSpeakersDrawerOpen);
  const speakers = useValue($store.speakers);
  const speakerColors = useValue($store.speakerColors);
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const fileId = useSelector(() => $store.fileId.get());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newSpeakerLabel, setNewSpeakerLabel] = useState("");

  const editInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const createSpeakerMutation = api.file.createSpeaker.useMutation();
  const updateSpeakerMutation = api.file.updateSpeaker.useMutation();
  const deleteSpeakerMutation = api.file.deleteSpeaker.useMutation();

  // Focus input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  const handleClose = () => {
    $store.closeSpeakersDrawer();
    setEditingId(null);
    setIsCreating(false);
  };

  const handleSelectSpeaker = (speakerId: string) => {
    $store.selectSpeaker(speakerId);
    handleClose();
  };

  const handleStartEdit = (speakerId: string, currentLabel: string) => {
    setEditingId(speakerId);
    setEditValue(currentLabel);
  };

  const handleConfirmEdit = () => {
    if (!editingId) return;

    const trimmed = editValue.trim();
    const speaker = speakers.find((s) => s.id === editingId);

    if (trimmed && speaker && trimmed !== speaker.label) {
      updateSpeakerMutation.mutate({
        fileId,
        speakerId: editingId,
        updates: { label: trimmed },
      });
    }

    setEditingId(null);
  };

  const handleDelete = (speakerId: string) => {
    // If this speaker has segments, we might want to reassign them
    // For now, just delete the speaker
    deleteSpeakerMutation.mutate({ fileId, speakerId });

    // If the deleted speaker was selected, clear selection
    if (selectedSpeakerId === speakerId) {
      $store.selectSpeaker(null);
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewSpeakerLabel("");
  };

  const handleConfirmCreate = () => {
    const trimmed = newSpeakerLabel.trim();
    if (trimmed) {
      createSpeakerMutation.mutate({ fileId, label: trimmed });
    }
    setIsCreating(false);
    setNewSpeakerLabel("");
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    action: "edit" | "create",
  ) => {
    if (e.key === "Enter") {
      if (action === "edit") {
        handleConfirmEdit();
      } else {
        handleConfirmCreate();
      }
    } else if (e.key === "Escape") {
      if (action === "edit") {
        setEditingId(null);
      } else {
        setIsCreating(false);
      }
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-[320px] sm:w-[360px]">
        <SheetHeader>
          <SheetTitle>Speakers</SheetTitle>
          <SheetDescription>
            Manage workspace speakers. Click a speaker to filter segments.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-2">
          {speakers.map((speaker) => {
            const isEditing = editingId === speaker.id;
            const isSelected = selectedSpeakerId === speaker.id;

            return (
              <div
                key={speaker.id}
                className={`group flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted/50"
                }`}
              >
                {/* Color dot */}
                <div
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: speakerColors[speaker.id] }}
                />

                {/* Label or edit input */}
                {isEditing ? (
                  <Input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleConfirmEdit}
                    onKeyDown={(e) => handleKeyDown(e, "edit")}
                    className="h-8 flex-1"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectSpeaker(speaker.id)}
                    className="flex-1 truncate text-left font-medium text-sm"
                  >
                    {speaker.label}
                  </button>
                )}

                {/* Actions (visible on hover) */}
                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(speaker.id, speaker.label);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(speaker.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Create new speaker */}
          {isCreating ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-3">
              <div className="h-4 w-4 shrink-0 rounded-full bg-muted" />
              <Input
                ref={createInputRef}
                value={newSpeakerLabel}
                onChange={(e) => setNewSpeakerLabel(e.target.value)}
                onBlur={() => {
                  if (!newSpeakerLabel.trim()) {
                    setIsCreating(false);
                  } else {
                    handleConfirmCreate();
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, "create")}
                placeholder="Speaker name..."
                className="h-8 flex-1"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              className="mt-2 w-full gap-2"
              onClick={handleStartCreate}
            >
              <Plus className="h-4 w-4" />
              Add Speaker
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useSelector, useValue } from "@legendapp/state/react";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Speaker header shown above the segments table.
 *
 * Displays the currently selected speaker's name with:
 * - Duration distribution mini-chart (left side)
 * - Color indicator dot
 * - Large prominent text
 * - Edit icon for inline renaming
 * - Segment count badge (right side)
 */
export function SpeakerHeader() {
  const $store = useClippingStore();

  const fileId = useSelector(() => $store.fileId.get());
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const speakers = useValue($store.speakers);
  const speakerColors = useValue($store.speakerColors);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const updateSpeakerMutation = api.file.updateSpeaker.useMutation();

  // Get current speaker
  const currentSpeaker = speakers.find((s) => s.id === selectedSpeakerId);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!selectedSpeakerId || !currentSpeaker) {
    return null;
  }

  const handleStartEdit = () => {
    setEditValue(currentSpeaker.label);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== currentSpeaker.label) {
      updateSpeakerMutation.mutate({
        fileId,
        speakerId: selectedSpeakerId,
        label: trimmed,
      });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const speakerColor = speakerColors[selectedSpeakerId];

  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
      {/* Color indicator */}
      <div
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: speakerColor }}
      />

      {/* Speaker name - editable */}
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleConfirmEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-auto max-w-[300px] font-semibold text-lg"
        />
      ) : (
        <h2 className="font-semibold text-lg">{currentSpeaker.label}</h2>
      )}

      {/* Edit button */}
      {!isEditing && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleStartEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Segment count badge - next to speaker name */}
      <SegmentCountBadge speakerId={selectedSpeakerId} />
    </div>
  );
}

/**
 * Small badge showing segment count for the speaker.
 * Separated to minimize re-renders.
 */
function SegmentCountBadge({ speakerId }: { speakerId: string }) {
  const $store = useClippingStore();

  const segmentCount = useValue(() => {
    const segments = $store.segments.get();
    return segments.filter((s) => s.speakerId === speakerId && !s.isDeleted)
      .length;
  });

  return (
    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
      {segmentCount} segment{segmentCount !== 1 ? "s" : ""}
    </span>
  );
}

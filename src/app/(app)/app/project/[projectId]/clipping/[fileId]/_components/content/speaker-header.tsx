"use client";

import { useSelector, useValue } from "@legendapp/state/react";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import { getDurationDistribution } from "../../_utils/segment-utils";

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

      {/* Spacer to push right content */}
      <div className="flex-1" />

      {/* Segment count badge */}
      <SegmentCountBadge speakerId={selectedSpeakerId} />

      {/* Duration distribution mini-chart (right side) */}
      <DurationDistributionChart speakerId={selectedSpeakerId} />
    </div>
  );
}

/**
 * Compact duration distribution chart for the speaker header.
 * Shows segment duration distribution as a mini histogram.
 */
function DurationDistributionChart({ speakerId }: { speakerId: string }) {
  const $store = useClippingStore();

  const distribution = useValue(() => {
    const segments = $store.segments.get();
    const speakerSegments = segments.filter((s) => s.speakerId === speakerId);
    return getDurationDistribution(speakerSegments);
  });

  const maxDistribution = Math.max(...distribution, 1);
  const totalSegments = distribution.reduce((sum, count) => sum + count, 0);

  // Don't show if no segments
  if (totalSegments === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-6 w-16 shrink-0 cursor-help items-end gap-px rounded bg-muted/50 px-1 py-0.5">
          {distribution.map((count, idx) => {
            // Fixed bucket labels: 0-1s, 1-3s, 3-5s, 5-8s, 8-12s, 12-15s, 15-20s, 20-30s, 30s+
            const bucketKeys = ["0-1", "1-3", "3-5", "5-8", "8-12", "12-15", "15-20", "20-30", "30+"];
            return (
              <div
                key={bucketKeys[idx]}
                className="flex-1 rounded-t bg-primary/60 transition-all"
                style={{
                  height: `${(count / maxDistribution) * 100}%`,
                  minHeight: count > 0 ? "2px" : "0",
                }}
              />
            );
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p className="font-medium">Duration Distribution</p>
        <p className="text-muted-foreground">0.5s → 30s+</p>
      </TooltipContent>
    </Tooltip>
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
    return segments.filter(
      (s) => s.speakerId === speakerId && !s.isDeleted,
    ).length;
  });

  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
      {segmentCount} segment{segmentCount !== 1 ? "s" : ""}
    </span>
  );
}

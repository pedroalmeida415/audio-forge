/* biome-ignore-all lint/a11y/noStaticElementInteractions: clickable card */
/* biome-ignore-all lint/a11y/useKeyWithClickEvents: clickable card */
"use client";

import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";
import type { ClipWithMockedFields } from "../_hooks/use-collection-state";
import { ClipCard } from "./clip-card";

type ClipItemProps = {
  clip: ClipWithMockedFields;
  isActive: boolean;
  isSelected: boolean;
  onCardClick: () => void;
  onCheckboxChange: () => void;
};

export function ClipItem({
  clip,
  isActive,
  isSelected,
  onCardClick,
  onCheckboxChange,
}: ClipItemProps) {
  return (
    <div>
      <div
        className={cn(
          "cursor-pointer rounded-lg border bg-card/50 p-4 transition-all",
          isActive && !isSelected && "border-primary/50 bg-primary/5",
          isSelected && "border-accent/50 bg-accent/5",
        )}
        onClick={onCardClick}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              className="size-4.5"
              onCheckedChange={onCheckboxChange}
            />
          </div>

          <div className="flex min-w-0 flex-1 gap-3">
            <ClipCard
              duration={clip.duration}
              mosScore={clip.mosScore}
              type="original"
            />
            <ClipCard
              duration={clip.processedClip?.duration ?? 0}
              isEmpty={!clip.processedClip}
              mosScore={clip.processedClip?.mosScore ?? null}
              type="processed"
            />
          </div>
        </div>
      </div>
      <div
        className={cn(
          "mr-4 ml-13 rounded-b-lg border border-t-0 bg-card/50 px-10 py-2 transition-colors",
          isActive && !isSelected && "border-primary/50 bg-primary/5",
          isSelected && "border-accent/50 bg-accent/5",
          !clip.transcript && "italic",
        )}
      >
        <p className="line-clamp-2 text-muted-foreground text-sm">
          {clip.transcript ?? "No transcription available"}
        </p>
      </div>
    </div>
  );
}

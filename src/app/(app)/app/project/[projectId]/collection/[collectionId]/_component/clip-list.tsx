"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { FileAudio } from "lucide-react";
import { useRef } from "react";
import type { ClipWithMockedFields } from "../_hooks/use-collection-state";
import { ClipItem } from "./clip-item";

type ClipListProps = {
  clips: ClipWithMockedFields[];
  activeClipId: string | null;
  selectedClipIds: Set<string>;
  onClipClick: (id: string) => void;
  onCheckboxChange: (id: string) => void;
};

export function ClipList({
  clips,
  activeClipId,
  selectedClipIds,
  onClipClick,
  onCheckboxChange,
}: ClipListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160,
    overscan: 5,
  });

  if (clips.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <FileAudio className="size-12 opacity-50" />
        <div className="text-center">
          <p className="font-medium">No clips in this collection</p>
          <p className="text-sm">
            Clips will appear here once they are added to this collection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4" ref={parentRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const clip = clips[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ClipItem
                clip={clip}
                isActive={activeClipId === clip.id}
                isSelected={selectedClipIds.has(clip.id)}
                onCardClick={() => onClipClick(clip.id)}
                onCheckboxChange={() => onCheckboxChange(clip.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { Play, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

/**
 * Formats time in MM:SS.mmm format
 */
function formatTimeWithMs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

/**
 * Selection controls floating toolbar.
 *
 * Shows when selection mode is 'active'. Provides:
 * - Speaker picker dropdown
 * - Play selection button
 * - Create Segment button
 *
 * Portal renders to document.body to escape container overflow.
 */
export function SelectionControls() {
  const $store = useClippingStore();
  const { diarizationId } = useParams<{ diarizationId: string }>();
  const createSegmentMutation = api.diarization.createSegment.useMutation();

  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  // Subscribe to reactive values
  const mode = useSelector(() => $store.selection.mode.get());
  const range = useSelector(() => $store.selection.getSelectionRange.get());
  const selectedSpeaker = useSelector(() => {
    const selectionSpeaker = $store.selection.selectedSpeaker.get();
    return selectionSpeaker ?? $store.selectedSpeaker.get() ?? "SPEAKER_00";
  });
  const speakers = useSelector(() => Array.from($store.speakers.get()));
  const speakerColors = useSelector(() => $store.speakerColors.get());
  const speakerCollections = useSelector(() => $store.speakerCollections.get());

  // Ensure we only render portal after mount (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track position based on selection bounds
  useEffect(() => {
    const dispose = observe(() => {
      const mode = $store.selection.mode.get();
      if (mode !== "active") {
        setPosition(null);
        return;
      }

      const bounds = $store.selection.getSelectionPixelBounds.get();
      if (!bounds) {
        setPosition(null);
        return;
      }

      // Find the timeline container for viewport offset
      const container = document.querySelector(
        "[data-timeline-segments-bar]",
      ) as HTMLElement | null;
      if (!container) {
        setPosition(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const scrollOffset = $store.timeline.scrollOffset.get();

      // Position above the selection, centered
      const viewportLeft = bounds.left - scrollOffset;
      setPosition({
        left: containerRect.left + viewportLeft + bounds.width / 2,
        top: containerRect.top - 8, // 8px above
      });
    });

    return dispose;
  }, [$store]);

  // Escape key cancels selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && $store.selection.mode.peek() === "active") {
        $store.selection.cancelSelection();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [$store]);

  const handleCreate = () => {
    if (!range) return;

    createSegmentMutation.mutate({
      diarizationId,
      segment: {
        speaker: selectedSpeaker,
        start: range.start,
        end: range.end,
      },
    });
  };

  const handlePlaySelection = () => {
    if (range) {
      $store.playback.playSegment(range.start, range.end);
    }
  };

  const handleSpeakerChange = (speaker: string) => {
    $store.selection.setSelectedSpeaker(speaker);
  };

  // Don't render if not mounted, not active, or no position
  if (!mounted || mode !== "active" || !position || !range) return null;

  return createPortal(
    <div
      className="-translate-x-1/2 -translate-y-full fixed z-50 flex items-center gap-2 rounded-lg border bg-popover p-2 shadow-lg"
      style={{ left: position.left, top: position.top }}
      data-selection-ui
    >
      {/* Time range display */}
      <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
        <span>{formatTimeWithMs(range.start)}</span>
        <span>-</span>
        <span>{formatTimeWithMs(range.end)}</span>
      </div>

      {/* Speaker picker */}
      <Select value={selectedSpeaker} onValueChange={handleSpeakerChange}>
        <SelectTrigger className="w-[140px] border bg-background" size="sm">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: speakerColors[selectedSpeaker] }}
            />
            <SelectValue placeholder="Speaker" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {speakers.map((speaker) => (
            <SelectItem key={speaker} value={speaker}>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: speakerColors[speaker] }}
                />
                <span>
                  {speakerCollections[speaker]?.collectionName ?? speaker}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Play selection button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handlePlaySelection}
        title="Play selection"
      >
        <Play className="h-4 w-4" />
      </Button>

      {/* Create segment button */}
      <Button
        size="sm"
        onClick={handleCreate}
        disabled={createSegmentMutation.isPending}
      >
        <Plus className="mr-1 h-4 w-4" />
        Create
      </Button>
    </div>,
    document.body,
  );
}

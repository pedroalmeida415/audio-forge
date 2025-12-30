"use client";

import { useValue } from "@legendapp/state/react";
import { AudioWaveform, Users } from "lucide-react";
import { useEffect } from "react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useClippingStore } from "../../_context/store.context";
import { SpeakerHeader } from "../content";
import { SegmentsTable } from "./segments-table";

/**
 * Table view container with speakers sidebar, speaker header, and segments table.
 *
 * Auto-selects the first speaker on mount if none is selected.
 * Shows an empty state only when there are no speakers at all.
 */
export function TableView() {
  const $store = useClippingStore();
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const speakers = useValue($store.speakers);
  const speakerColors = useValue($store.speakerColors);

  // Auto-select first speaker on mount if none selected
  useEffect(() => {
    if (!selectedSpeakerId && speakers.length > 0) {
      const firstSpeaker = speakers[0];
      if (firstSpeaker) {
        $store.selectSpeaker(firstSpeaker.id);
      }
    }
  }, [selectedSpeakerId, speakers, $store]);

  const handleOpenSpeakers = () => {
    $store.openSpeakersDrawer();
  };

  // Empty state when no speakers exist at all
  if (speakers.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AudioWaveform className="h-10 w-10 opacity-50" />
        <div className="text-center">
          <p className="text-sm">No speakers yet</p>
          <p className="text-muted-foreground/70 text-xs">
            Run diarization or create segments manually
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left sidebar: Speaker list */}
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-2">
        {/* Speaker buttons */}
        {speakers.map((speaker) => {
          // Get first letter of speaker name
          const initial = speaker.label.charAt(0).toUpperCase();

          return (
            <Tooltip key={speaker.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => $store.selectSpeaker(speaker.id)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    selectedSpeakerId === speaker.id
                      ? "bg-primary/10 ring-2 ring-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full font-medium text-white text-xs"
                    style={{ backgroundColor: speakerColors[speaker.id] }}
                  >
                    {initial}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{speaker.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Manage speakers button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleOpenSpeakers}
            >
              <Users className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Manage Speakers</p>
          </TooltipContent>
        </Tooltip>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Speaker header with name and edit */}
        <SpeakerHeader />

        {/* Segments table */}
        <SegmentsTable />
      </div>
    </div>
  );
}

"use client";

import { useValue } from "@legendapp/state/react";
import { AudioWaveform } from "lucide-react";
import { useEffect } from "react";
import { useClippingStore } from "../../_context/store.context";
import { SpeakerHeader } from "../content";
import { SegmentsTable } from "./segments-table";

/**
 * Table view container with speaker header and segments table.
 *
 * Auto-selects the first speaker on mount if none is selected.
 * Shows an empty state only when there are no speakers at all.
 */
export function TableView() {
  const $store = useClippingStore();
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const speakers = useValue($store.speakers);

  // Auto-select first speaker on mount if none selected
  useEffect(() => {
    if (!selectedSpeakerId && speakers.length > 0) {
      const firstSpeaker = speakers[0];
      if (firstSpeaker) {
        $store.selectSpeaker(firstSpeaker.id);
      }
    }
  }, [selectedSpeakerId, speakers, $store]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Speaker header with name and edit */}
      <SpeakerHeader />

      {/* Segments table */}
      <SegmentsTable />
    </div>
  );
}

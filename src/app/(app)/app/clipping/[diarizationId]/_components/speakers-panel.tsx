"use client";

import { cn } from "~/lib/utils";
import { useClippingWorkspace } from "../_context/clipping-workspace-context";
import { SpeakerCard } from "./speaker-card";

export function SpeakersPanel() {
  const { workspace } = useClippingWorkspace();
  const { speakers, selectedSpeaker, selectSpeaker } = workspace;

  return (
    <div className="w-64 shrink-0 overflow-y-auto border-r bg-muted/20">
      <div className="p-4">
        <h2 className="mb-4 font-medium text-muted-foreground text-sm uppercase tracking-wider">
          Speakers
        </h2>

        <div className="space-y-2">
          {/* All speakers option */}
          <button
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              selectedSpeaker === null
                ? "border-primary bg-primary/10"
                : "border-transparent hover:bg-muted/50",
            )}
            onClick={() => selectSpeaker(null)}
            type="button"
          >
            <div className="font-medium text-sm">All Speakers</div>
            <div className="text-muted-foreground text-xs">
              {speakers.reduce((sum, s) => sum + s.segmentCount, 0)} segments
            </div>
          </button>

          {/* Individual speakers */}
          {speakers.map((speaker) => (
            <SpeakerCard
              isSelected={selectedSpeaker === speaker.id}
              key={speaker.id}
              onSelect={() => selectSpeaker(speaker.id)}
              speaker={speaker}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

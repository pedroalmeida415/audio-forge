"use client";

import { SpeakerStatsCard } from "./speaker-stats-card";

export function SpeakerSidebar() {
  return (
    <aside className="flex flex-col gap-4">
      <SpeakerStatsCard />
    </aside>
  );
}

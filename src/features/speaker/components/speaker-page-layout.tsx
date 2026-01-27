"use client";

import { SegmentsList } from "./segments-list";
import { SpeakerHeader } from "./speaker-header";
import { SpeakerSidebar } from "./speaker-sidebar";

export function SpeakerPageLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-6 pt-6">
        <SpeakerHeader />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-6">
        {/* Main content area with segments list */}
        <div className="min-w-0 flex-1">
          <SegmentsList />
        </div>

        {/* Sidebar with stats and actions - sticky positioning */}
        <div className="shrink-0">
          <div className="sticky top-6">
            <SpeakerSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}

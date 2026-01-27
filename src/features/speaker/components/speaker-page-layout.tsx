"use client";

import { SegmentsList } from "./segments-list";
import { SpeakerHeader } from "./speaker-header";
import { SpeakerSidebar } from "./speaker-sidebar";

export function SpeakerPageLayout() {
  return (
    <div className="relative flex min-h-full flex-col bg-gradient-to-br from-background via-card to-background">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
        <div className="absolute right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-muted-foreground/[0.05] blur-[80px]" />
      </div>

      <div className="relative flex h-20 items-center border-border border-b px-6">
        <SpeakerHeader />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 gap-6 p-6">
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

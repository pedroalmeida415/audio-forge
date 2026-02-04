"use client";

import { SpeakerHeader } from "./speaker-header";
import { SpeakerSidebar } from "./speaker-sidebar";
import { SegmentsTable } from "./table/segments-table";

export function SpeakerPageLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header - full width, sticky at top */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-border border-b bg-background px-6">
        <SpeakerHeader />
      </header>

      {/* Main content area below header */}
      <div className="flex min-h-0 flex-1">
        {/* Table container */}
        <div className="min-w-0 flex-1 p-4">
          <SegmentsTable />
        </div>

        {/* Sidebar - sticky, under header */}
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-[196px] shrink-0 overflow-y-auto border-border border-l bg-background p-4">
          <SpeakerSidebar />
        </aside>
      </div>
    </div>
  );
}

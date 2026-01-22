"use client";

import { ScrollArea } from "~/components/ui/scroll-area";
import { SegmentsList } from "./segments-list";
import { SpeakerHeader } from "./speaker-header";
import { SpeakerSidebar } from "./speaker-sidebar";

export function SpeakerPageLayout() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <SpeakerHeader />
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden p-6">
        {/* Main content area with segments list */}
        <div className="min-w-0 flex-1">
          <ScrollArea className="h-full pr-4">
            <SegmentsList />
          </ScrollArea>
        </div>

        {/* Sidebar with stats and actions */}
        <div className="shrink-0">
          <SpeakerSidebar />
        </div>
      </div>
    </div>
  );
}

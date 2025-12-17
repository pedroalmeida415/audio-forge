"use client";

import { Users } from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import { BulkActions } from "./bulk-actions";
import { CollectionCombobox } from "./collection-combobox";
import { SelectionSummary } from "./selection-summary";
import { StatsSection } from "./stats-section";

export function RightSidebar() {
  const diarizationId = useClippingWorkspaceStore((s) => s.segments.diarizationId);
  const projectId = useClippingWorkspaceStore((s) => s.segments.projectId);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.segments.selectedSpeaker);

  if (!selectedSpeaker) {
    return (
      <aside className="flex w-[280px] flex-col items-center justify-center border-l bg-muted/20 text-muted-foreground">
        <Users className="mb-2 h-10 w-10 opacity-50" />
        <p className="text-sm">Select a speaker to view options</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-[280px] flex-col border-l bg-muted/20">
      {/* Scrollable content area */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Collection mapping for current speaker */}
          <CollectionCombobox
            speaker={selectedSpeaker}
            diarizationId={diarizationId}
            projectId={projectId}
          />

          <Separator />

          {/* Selection Summary - shows when items selected */}
          <SelectionSummary />

          {/* Bulk Actions - shows when items selected */}
          <BulkActions />
        </div>
      </ScrollArea>

      {/* Stats pinned to bottom */}
      <div className="shrink-0 border-t p-4">
        <StatsSection />
      </div>
    </aside>
  );
}

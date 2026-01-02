"use client";

import { useValue } from "@legendapp/state/react";
import { Users } from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useClippingStore } from "../../_context/store.context";
import { SegmentActions } from "./bulk-actions";
import { SelectionSummary } from "./selection-summary";

export function RightSidebar() {
  const $store = useClippingStore();

  const selectedSpeakerId = useValue($store.selectedSpeakerId);

  if (!selectedSpeakerId) {
    return (
      <aside className="flex w-[280px] flex-col items-center justify-center border-l bg-muted/20 text-muted-foreground">
        <Users className="mb-2 h-10 w-10 opacity-50" />
        <p className="text-sm">Select a speaker to view options</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-[280px] flex-col border-l bg-muted/20">
      {/* Separator */}

      {/* Duration distribution chart */}
      {/* <div className="px-4 py-2">
        <DurationDistributionChart speakerId={selectedSpeakerId} />
      </div> */}
      {/* <Separator /> */}
      {/* Scrollable content area */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Selection Summary - always visible, dimmed when no selection */}
          <SelectionSummary />

          {/* Actions - always visible, disabled when no selection */}
          <SegmentActions />
        </div>
      </ScrollArea>
    </aside>
  );
}

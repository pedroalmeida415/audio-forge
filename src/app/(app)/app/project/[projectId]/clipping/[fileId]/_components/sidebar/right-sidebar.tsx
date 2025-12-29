"use client";

import { useValue } from "@legendapp/state/react";
import { Upload, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { useClippingStore } from "../../_context/store.context";
import { ExportDialog } from "../dialogs";
import { SegmentActions } from "./bulk-actions";
import { DurationDistributionChart } from "./duration-distribution-chart";
import { SelectionSummary } from "./selection-summary";

export function RightSidebar() {
  const $store = useClippingStore();

  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Export only works with checkbox-selected segments
  const selectionCount = selectedSegmentIds.size;

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
      {/* Scrollable content area */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Selection Summary - always visible, dimmed when no selection */}
          <SelectionSummary />

          {/* Actions - always visible, disabled when no selection */}
          <SegmentActions />
        </div>
      </ScrollArea>

      {/* Bottom section pinned */}
      {/* Export button */}
      <div className="p-4">
        <Button
          size="lg"
          className="h-10 w-full"
          onClick={() => setExportDialogOpen(true)}
          disabled={selectionCount === 0}
        >
          <Upload className="mr-2 h-4 w-4" />
          {selectionCount > 0
            ? `Export ${selectionCount} Segment${selectionCount !== 1 ? "s" : ""}`
            : "Export to Collection"}
        </Button>
      </div>

      {/* Separator */}
      <Separator />

      {/* Duration distribution chart */}
      <div className="px-4 py-2">
        <DurationDistributionChart speakerId={selectedSpeakerId} />
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </aside>
  );
}

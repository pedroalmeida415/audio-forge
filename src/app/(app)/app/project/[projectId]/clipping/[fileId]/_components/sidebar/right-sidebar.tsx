"use client";

import { useValue } from "@legendapp/state/react";
import { Upload, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useClippingStore } from "../../_context/store.context";
import { ExportDialog } from "../dialogs";
import { SegmentActions } from "./bulk-actions";
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
          {/* Selection Summary - shows when items selected */}
          <SelectionSummary />

          {/* Actions - for checkbox-selected segments only */}
          <SegmentActions />
        </div>
      </ScrollArea>

      {/* Export section pinned to bottom */}
      <div className="shrink-0 border-t bg-background p-4">
        <Button
          size="lg"
          className="w-full"
          onClick={() => setExportDialogOpen(true)}
          disabled={selectionCount === 0}
        >
          <Upload className="mr-2 h-4 w-4" />
          {selectionCount > 0
            ? `Export ${selectionCount} Segment${selectionCount !== 1 ? "s" : ""}`
            : "Export to Collection"}
        </Button>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </aside>
  );
}

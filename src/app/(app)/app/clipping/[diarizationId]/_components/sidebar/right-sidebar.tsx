"use client";

import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { BulkActions } from "./bulk-actions";
import { ExportReadinessSection } from "./export-readiness-section";
import { KeyboardShortcutsSection } from "./keyboard-shortcuts-section";
import { SelectionSummary } from "./selection-summary";
import { StatsSection } from "./stats-section";

export function RightSidebar() {
  return (
    <aside className="flex w-[280px] flex-col border-l bg-muted/20">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Selection Summary - shows when items selected */}
          <SelectionSummary />

          {/* Bulk Actions - shows when items selected */}
          <BulkActions />

          {/* Stats Section */}
          <StatsSection />

          <Separator />

          {/* Export Readiness */}
          <ExportReadinessSection />

          <Separator />

          {/* Keyboard Shortcuts */}
          <KeyboardShortcutsSection />
        </div>
      </ScrollArea>
    </aside>
  );
}

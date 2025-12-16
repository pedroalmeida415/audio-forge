"use client";

import { Users } from "lucide-react";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import { SegmentsTable } from "./segments-table";

export function TableView() {
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);

  if (!selectedSpeaker) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Users className="h-10 w-10 opacity-50" />
        <p className="text-sm">Select a speaker to view segments</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SegmentsTable />
    </div>
  );
}

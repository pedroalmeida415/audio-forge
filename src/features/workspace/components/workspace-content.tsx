"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { api } from "~/trpc/react";
import { useWorkspaceStore } from "../context/workspace-store-context";
import { workspaceParams } from "../search-params";
import { SegmentsStatisticsBar } from "./segments-statistics-bar";
import { SegmentsTable } from "./table/segments-table";

export function WorkspaceContent() {
  const { store } = useWorkspaceStore();

  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const { data, isLoading } = api.segment.getBySpeaker.useQuery(
    { speakerId: speakerId ?? "" },
    { enabled: !!speakerId },
  );

  const segments = data?.segments ?? [];

  // Clear selection when switching speakers
  useEffect(() => {
    store.clearSelection();
  }, [speakerId]);

  if (!speakerId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        Select a speaker to get started.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading segments...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-w-0 flex-1 p-4">
        <SegmentsTable segments={segments} />
      </div>
      <SegmentsStatisticsBar />
    </div>
  );
}

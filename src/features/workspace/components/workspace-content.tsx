"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { api } from "~/trpc/react";
import { useWorkspaceStore } from "../context/workspace-store-context";
import { workspaceParams } from "../search-params";
import { SegmentsTable } from "./table/segments-table";
import { WorkspaceSidebar } from "./workspace-sidebar";

export function WorkspaceContent() {
  const { store } = useWorkspaceStore();

  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const bySpeaker = api.segment.getBySpeaker.useQuery(
    { speakerId: speakerId ?? "" },
    { enabled: !!speakerId && !sourceId },
  );

  const bySource = api.segment.getBySource.useQuery(
    { sourceId: sourceId ?? "" },
    { enabled: !!sourceId },
  );

  const activeQuery = sourceId ? bySource : bySpeaker;

  const allSegments = activeQuery.data?.segments ?? [];
  const segments =
    sourceId && speakerId
      ? allSegments.filter((s) => s.speakerId === speakerId)
      : allSegments;

  // Clear selection when switching speakers or sources
  useEffect(() => {
    store.clearSelection();
  }, [speakerId, sourceId]);

  if (!speakerId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        Select a speaker to get started.
      </div>
    );
  }

  if (activeQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading segments...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 p-4">
        <SegmentsTable segments={segments} />
      </div>
      <WorkspaceSidebar />
    </div>
  );
}

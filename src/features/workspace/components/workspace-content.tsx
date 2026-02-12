"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { api } from "~/trpc/react";
import { useWorkspaceStore } from "../context/workspace-store-context";
import { workspaceParams } from "../search-params";
import { SegmentsTable } from "./table/segments-table";
import { WorkspaceSidebar } from "./workspace-sidebar";

export function WorkspaceContent() {
  const $store = useWorkspaceStore();
  const { segments } = useSnapshot($store);

  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const {
    data: segmentIds,
    isLoading,
    isFetching,
  } = api.segment.getIdsBySpeaker.useQuery(
    { speakerId: speakerId! },
    { enabled: !!speakerId },
  );

  useEffect(() => {
    if (segmentIds) {
      $store.initializeSegments(segmentIds);
    }
  }, [segmentIds]);

  if (!speakerId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        Select a speaker to get started.
      </div>
    );
  }

  // TODO: fix race condition between query success and store update in effect happening after query succeed, causing the table to render with prior segments when switching between speakers. Should either clear segments state right when switching speakers or synchronize effect state update with query success or handle loading directly through state.
  if (isLoading || isFetching) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading segments...
      </div>
    );
  }

  if (!segments.size) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        No segments found for this speaker.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 p-4">
        <SegmentsTable />
      </div>
      <WorkspaceSidebar />
    </div>
  );
}

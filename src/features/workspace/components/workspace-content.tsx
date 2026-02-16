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
  const $store = useWorkspaceStore();

  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    api.segment.getBySpeaker.useInfiniteQuery(
      { speakerId: speakerId ?? "", limit: 50 },
      {
        enabled: !!speakerId,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const segments = data?.pages.flatMap((p) => p.segments) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Clear selection when switching speakers
  useEffect(() => {
    $store.clearSelection();
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

  if (segments.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        No segments found for this speaker.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 p-4">
        <SegmentsTable
          segments={segments}
          totalCount={totalCount}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      </div>
      <WorkspaceSidebar />
    </div>
  );
}

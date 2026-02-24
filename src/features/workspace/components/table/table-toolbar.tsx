"use client";

import { Loader2, Trash2, UserRoundCog } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useState } from "react";
import type { Table } from "@tanstack/react-table";
import { useSnapshot } from "valtio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { ChangeSpeakerDialog } from "~/features/workspace/components/change-speaker-dialog";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import {
  useWorkspaceBulkDeleteSegmentsMutation,
  useWorkspaceDeleteSegmentsMutation,
} from "~/features/workspace/hooks/use-workspace-mutations";
import { workspaceParams } from "~/features/workspace/search-params";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { api } from "~/trpc/react";
import { TableFilterPopover } from "./segments-table-filter";

export function TableToolbar({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const { projectId } = useParams<{ projectId: string }>();
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const { store } = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot(store);

  const utils = api.useUtils();

  const cachedSegments = sourceId
    ? (utils.segment.getBySource.getData({ sourceId })?.segments ?? [])
    : speakerId
      ? (utils.segment.getBySpeaker.getData({ speakerId })?.segments ?? [])
      : [];

  // When viewing a source, we only count segments for the active speaker
  const totalCount =
    sourceId && speakerId
      ? cachedSegments.filter((s) => s.speakerId === speakerId).length
      : cachedSegments.length;

  const selectedCount = isAllSelected
    ? totalCount - excludedSegmentIds.size
    : selectedSegmentIds.size;
  const hasSelection = selectedCount > 0;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showChangeSpeakerDialog, setShowChangeSpeakerDialog] = useState(false);

  // Fetch current speaker for the dialog description
  const { data: speakers } = api.speaker.getByProject.useQuery(
    { projectId },
    { enabled: showChangeSpeakerDialog },
  );
  const currentSpeaker = speakers?.find((s) => s.id === speakerId);

  const cacheContext = { sourceId, speakerId };

  const deleteSegmentsMutation =
    useWorkspaceDeleteSegmentsMutation(cacheContext);

  const bulkDeleteMutation =
    useWorkspaceBulkDeleteSegmentsMutation(cacheContext);

  const isDeleting =
    deleteSegmentsMutation.isPending || bulkDeleteMutation.isPending;

  const handleDelete = () => {
    if (!hasSelection || !speakerId) return;

    if (isAllSelected) {
      const excludeSegmentIds =
        excludedSegmentIds.size > 0
          ? Array.from(excludedSegmentIds)
          : undefined;
      bulkDeleteMutation.mutate({ excludeSegmentIds });
    } else {
      const segmentIds = Array.from(selectedSegmentIds);
      deleteSegmentsMutation.mutate({ segmentIds });
    }

    store.clearSelection();
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-border border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-4">
          <TableFilterPopover table={table} />

          <div className="text-muted-foreground text-sm">
            {hasSelection ? (
              <span>
                {isAllSelected && excludedSegmentIds.size === 0 ? (
                  <>
                    <span className="font-medium text-foreground">All</span>{" "}
                    segments selected ({totalCount})
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {selectedCount}
                    </span>{" "}
                    segment{selectedCount !== 1 ? "s" : ""} selected
                  </>
                )}
              </span>
            ) : (
              <span>No segments selected</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangeSpeakerDialog(true)}
            disabled={!hasSelection}
          >
            <UserRoundCog className="size-4" />
            Change Speaker
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={!hasSelection}
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segments?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              {isAllSelected ? "all" : selectedCount} segment
              {selectedCount !== 1 ? "s" : ""} and their associated clips. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {speakerId && (
        <ChangeSpeakerDialog
          open={showChangeSpeakerDialog}
          onOpenChange={setShowChangeSpeakerDialog}
          segmentIds={
            isAllSelected ? undefined : Array.from(selectedSegmentIds)
          }
          excludeSegmentIds={
            isAllSelected && excludedSegmentIds.size > 0
              ? Array.from(excludedSegmentIds)
              : undefined
          }
          segmentCount={selectedCount}
          projectId={projectId}
          sourceId={sourceId}
          speakerId={speakerId}
          speakerName={currentSpeaker?.name ?? "Unknown"}
          onSuccess={() => store.clearSelection()}
        />
      )}
    </>
  );
}

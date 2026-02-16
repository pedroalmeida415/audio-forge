"use client";

import { Loader2, Trash2, UserRoundCog } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useState } from "react";
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
import { ChangeSpeakerDialog } from "~/features/speaker/components/change-speaker-dialog";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

function filterOutSegments(
  speakerId: string,
  ids: Set<string>,
  utils: ReturnType<typeof api.useUtils>,
) {
  utils.segment.getBySpeaker.setInfiniteData({ speakerId }, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => !ids.has(item.id)),
        totalCount: page.totalCount - ids.size,
      })),
    };
  });
}

export function TableToolbar() {
  const { projectId } = useParams<{ projectId: string }>();
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);

  const $store = useWorkspaceStore();
  const { isAllSelected, selectedSegmentIds } = useSnapshot($store);

  const hasSelection = isAllSelected || selectedSegmentIds.size > 0;

  const utils = api.useUtils();

  // Read totalCount from the query cache for display when isAllSelected
  const totalCount = speakerId
    ? (utils.segment.getBySpeaker.getInfiniteData({ speakerId })?.pages[0]
        ?.totalCount ?? 0)
    : 0;
  const selectedCount = isAllSelected ? totalCount : selectedSegmentIds.size;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showChangeSpeakerDialog, setShowChangeSpeakerDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch current speaker for the dialog description
  const { data: speakers } = api.speaker.getAllByProjectId.useQuery(
    { projectId },
    { enabled: showChangeSpeakerDialog },
  );
  const currentSpeaker = speakers?.find((s) => s.id === speakerId);

  const deleteMutation = api.segment.deleteSegmentsBySpeaker.useMutation({
    onSuccess: () => {
      if (speakerId) {
        if (isAllSelected) {
          utils.segment.getBySpeaker.invalidate({ speakerId });
        } else {
          filterOutSegments(speakerId, selectedSegmentIds, utils);
        }
      }
      $store.clearSelection();
      setIsDeleting(false);
      setShowDeleteDialog(false);
    },
    onError: () => {
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    if (!hasSelection || !speakerId) return;
    setIsDeleting(true);

    if (isAllSelected) {
      deleteMutation.mutate({ speakerId });
    } else {
      deleteMutation.mutate({
        speakerId,
        segmentIds: Array.from(selectedSegmentIds),
      });
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-border border-b bg-muted/30 px-4 py-2">
        <div className="text-muted-foreground text-sm">
          {hasSelection ? (
            <span>
              {isAllSelected ? (
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
          segmentCount={selectedCount}
          projectId={projectId}
          speakerId={speakerId}
          speakerName={currentSpeaker?.name ?? "Unknown"}
          onSuccess={() => {
            if (isAllSelected) {
              utils.segment.getBySpeaker.invalidate({ speakerId });
            } else {
              filterOutSegments(speakerId, selectedSegmentIds, utils);
            }
            $store.clearSelection();
          }}
        />
      )}
    </>
  );
}

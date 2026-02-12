"use client";

import { useValue } from "@legendapp/state/react";
import {
  Loader2,
  MessageSquare,
  Trash2,
  UserRoundCog,
  Volume2,
} from "lucide-react";
import { useState } from "react";
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
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { ChangeSpeakerDialog } from "../change-speaker-dialog";

export function TableToolbar() {
  const $store = useSpeakerPageStore();
  const selectedIds = useValue($store.selectedSegmentIds);
  const speaker = useValue($store.speaker);

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const [processingOperation, setProcessingOperation] = useState<string | null>(
    null,
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showChangeSpeakerDialog, setShowChangeSpeakerDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Queue processing mutation
  const queueMutation = api.segment.queueProcessing.useMutation({
    onMutate: (variables) => {
      $store.markClipsPending(variables.segmentIds);
    },
    onSuccess: (data) => {
      console.log("Queued:", data.jobIds.length, "jobs");
      setProcessingOperation(null);
      $store.clearSelection();
    },
    onError: (_error, variables) => {
      for (const id of variables.segmentIds) {
        $store.markClipComplete(id);
      }
      setProcessingOperation(null);
    },
  });

  // Delete segments mutation
  const deleteMutation = api.segment.deleteSegmentsBySpeaker.useMutation({
    onSuccess: (data) => {
      console.log("Deleted:", data.deletedCount, "segments");
      // Remove from store
      $store.removeSegments(Array.from(selectedIds));
      $store.clearSelection();
      setIsDeleting(false);
      setShowDeleteDialog(false);
    },
    onError: () => {
      setIsDeleting(false);
    },
  });

  const handleProcess = (
    operation: "denoise" | "remove_overlap" | "transcribe",
  ) => {
    if (!hasSelection) return;
    setProcessingOperation(operation);
    queueMutation.mutate({
      segmentIds: Array.from(selectedIds),
      operation,
    });
  };

  const handleDelete = () => {
    if (!hasSelection) return;
    setIsDeleting(true);
    deleteMutation.mutate({
      speakerId: speaker.id,
      segmentIds: Array.from(selectedIds),
    });
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-border border-b bg-muted/30 px-4 py-2">
        {/* Left: Selection count */}
        <div className="text-muted-foreground text-sm">
          {hasSelection ? (
            <span>
              <span className="font-medium text-foreground">
                {selectedCount}
              </span>{" "}
              segment{selectedCount !== 1 ? "s" : ""} selected
            </span>
          ) : (
            <span>No segments selected</span>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangeSpeakerDialog(true)}
            disabled={!hasSelection || queueMutation.isPending}
          >
            <UserRoundCog className="size-4" />
            Change Speaker
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProcess("transcribe")}
            disabled={!hasSelection || queueMutation.isPending}
          >
            {processingOperation === "transcribe" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            Transcribe
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProcess("denoise")}
            disabled={!hasSelection || queueMutation.isPending}
          >
            {processingOperation === "denoise" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Volume2 className="size-4" />
            )}
            Denoise
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={!hasSelection || queueMutation.isPending}
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segments?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCount} segment
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

      {/* Change speaker dialog */}
      <ChangeSpeakerDialog
        open={showChangeSpeakerDialog}
        onOpenChange={setShowChangeSpeakerDialog}
        segmentIds={Array.from(selectedIds)}
        projectId={speaker.projectId}
        speakerId={speaker.id}
        speakerName={speaker.name}
        onSuccess={() => {
          $store.removeSegments(Array.from(selectedIds));
          $store.clearSelection();
        }}
      />
    </>
  );
}

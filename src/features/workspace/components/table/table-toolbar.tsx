"use client";

import type { Table } from "@tanstack/react-table";
import {
  ChevronDown,
  FileAudio,
  Loader2,
  Sparkles,
  Subtitles,
  Trash2,
  UserRoundCog,
  Wand2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
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
  const [speakerId, setSpeakerId] = useQueryState(
    "speakerId",
    workspaceParams.speakerId,
  );

  const { store } = useWorkspaceStore();
  const { isAllSelected, excludedSegmentIds, selectedSegmentIds } =
    useSnapshot(store);

  const utils = api.useUtils();

  const cachedSegments = speakerId
    ? (utils.segment.getBySpeaker.getData({ speakerId })?.segments ?? [])
    : [];

  const totalCount = cachedSegments.length;

  const selectedCount = isAllSelected
    ? totalCount - excludedSegmentIds.size
    : selectedSegmentIds.size;
  const hasSelection = selectedCount > 0;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showChangeSpeakerDialog, setShowChangeSpeakerDialog] = useState(false);
  const [pendingProcess, setPendingProcess] = useState<{
    operation: "denoise" | "transcribe";
    segmentIds: string[];
  } | null>(null);

  // Fetch current speaker for the dialog description
  const { data: speakers } = api.speaker.getByProject.useQuery(
    { projectId },
    { enabled: showChangeSpeakerDialog },
  );
  const currentSpeaker = speakers?.find((s) => s.id === speakerId);

  const cacheContext = { sourceId: null, speakerId };

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

  const queueProcessingMutation = api.segment.queueProcessing.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Enqueued ${data.operation} for ${data.segmentCount} segment(s)`,
      );
    },
    onError: (error) => {
      toast.error(`Failed to enqueue processing: ${error.message}`);
    },
    onSettled: () => {
      setPendingProcess(null);
    },
  });

  const getSelectedSegmentIds = () => {
    if (isAllSelected) {
      return cachedSegments
        .filter((s) => !excludedSegmentIds.has(s.id))
        .map((s) => s.id);
    }
    return Array.from(selectedSegmentIds);
  };

  const handleProcess = (operation: "denoise" | "transcribe") => {
    if (!hasSelection) return;

    const segmentIds = getSelectedSegmentIds();
    if (segmentIds.length === 0) return;

    // Check if any selected segment has a clip
    const hasExistingClips = cachedSegments.some(
      (s) => segmentIds.includes(s.id) && s.clip !== null,
    );

    // If it's a transcription job, we don't ask about overriding audio since it doesn't modify audio
    if (hasExistingClips && operation !== "transcribe") {
      setPendingProcess({ operation, segmentIds });
    } else {
      queueProcessingMutation.mutate({
        segmentIds,
        operation,
        // Transcription should always use existing clips (not create new ones).
        // For non-transcribe without existing clips, false is fine (will create the first clip).
        useExistingClip: operation === "transcribe",
      });
      store.clearSelection();
    }
  };

  const confirmProcess = (useExistingClip: boolean) => {
    if (!pendingProcess) return;
    queueProcessingMutation.mutate({
      segmentIds: pendingProcess.segmentIds,
      operation: pendingProcess.operation,
      useExistingClip,
    });
    store.clearSelection();
  };

  // "Filter by active source" quick action
  const sourceColumn = table.getColumn("source");
  const currentSourceFilter = sourceColumn?.getFilterValue() as
    | string
    | undefined;
  const isFilteredByActiveSource =
    !!sourceId && currentSourceFilter === sourceId;

  const handleFilterByActiveSource = () => {
    if (!sourceColumn || !sourceId) return;
    if (isFilteredByActiveSource) {
      // Toggle off
      sourceColumn.setFilterValue(undefined);
    } else {
      sourceColumn.setFilterValue(sourceId);
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-border border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <TableFilterPopover table={table} />

          {sourceId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isFilteredByActiveSource ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 border-dashed"
                  onClick={handleFilterByActiveSource}
                >
                  <FileAudio className="mr-1 size-3.5" />
                  Active Source
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFilteredByActiveSource
                  ? "Clear source filter"
                  : "Filter by active source in Clip Studio"}
              </TooltipContent>
            </Tooltip>
          )}

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasSelection || queueProcessingMutation.isPending}
              >
                {queueProcessingMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Process
                <ChevronDown className="size-3 text-muted-foreground opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleProcess("denoise")}>
                <Wand2 className="mr-2 size-4" />
                Denoise Audio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleProcess("transcribe")}>
                <Subtitles className="mr-2 size-4" />
                Transcribe Speech
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

      <AlertDialog
        open={pendingProcess !== null}
        onOpenChange={(open) => {
          if (!open) setPendingProcess(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Process existing clips?</AlertDialogTitle>
            <AlertDialogDescription>
              Some of the selected segments already have processed clips. How do
              you want to apply this operation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => confirmProcess(false)}
              disabled={queueProcessingMutation.isPending}
              className="w-full sm:w-auto"
            >
              Process original audio (Replace existing clips)
            </Button>
            <Button
              onClick={() => confirmProcess(true)}
              disabled={queueProcessingMutation.isPending}
              className="w-full sm:w-auto"
            >
              Apply on top of existing clips (Keep current processing)
            </Button>
            <AlertDialogCancel
              disabled={queueProcessingMutation.isPending}
              className="mt-2 w-full sm:w-auto"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          sourceId={null}
          speakerId={speakerId}
          speakerName={currentSpeaker?.name ?? "Unknown"}
          onSuccess={(targetSpeakerId) => {
            store.clearSelection();
            if (
              isAllSelected &&
              excludedSegmentIds.size === 0 &&
              targetSpeakerId
            ) {
              setSpeakerId(targetSpeakerId).catch(console.error);
            }
          }}
        />
      )}
    </>
  );
}

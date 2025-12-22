"use client";

import { useValue } from "@legendapp/state/react";
import { Check, Download, Loader2, Trash2, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import { ChangeSpeakerDialog } from "../dialogs/change-speaker-dialog";

export function SegmentActions() {
  const $store = useClippingStore();

  const selectedSegmentIds = useValue($store.selectedSegmentIds);
  const activeSegmentId = useValue($store.activeSegmentId);
  const selectedSpeaker = useValue($store.selectedSpeaker);
  const diarizationId = useValue($store.diarizationId);
  const speakerCollections = useValue($store.speakerCollections);
  const allSegments = useValue($store.segments);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();
  const enqueueGenerationMutation = api.clips.enqueueGeneration.useMutation();

  const [changeSpeakerOpen, setChangeSpeakerOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Determine target IDs: selected segments if any, otherwise active segment
  const targetIds = useMemo(() => {
    if (selectedSegmentIds.size > 0) {
      return Array.from(selectedSegmentIds);
    }
    if (activeSegmentId) {
      return [activeSegmentId];
    }
    return [];
  }, [selectedSegmentIds, activeSegmentId]);

  // Get all non-deleted segments for current speaker (for "Export All" option)
  const speakerSegmentIds = useMemo(() => {
    if (!selectedSpeaker) return [];
    return allSegments
      .filter((s) => s.speaker === selectedSpeaker && !s.isDeleted)
      .map((s) => s.id);
  }, [allSegments, selectedSpeaker]);

  // Get collection for current speaker
  const currentCollection = selectedSpeaker
    ? speakerCollections[selectedSpeaker]
    : null;

  const hasTarget = targetIds.length > 0;
  const isMultiple = selectedSegmentIds.size > 1;
  const canExport = currentCollection && speakerSegmentIds.length > 0;

  const handleMarkAsReviewed = () => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: targetIds,
      updates: { isReviewed: true },
    });
  };

  const handleDelete = () => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: targetIds,
      updates: { isDeleted: true },
    });
  };

  const handleExportClips = (segmentIds: string[]) => {
    if (!currentCollection) {
      setExportStatus({
        type: "error",
        message: "Please select a collection first",
      });
      return;
    }

    setExportStatus(null);

    enqueueGenerationMutation.mutate(
      {
        diarizationId,
        collectionId: currentCollection.collectionId,
        segmentIds,
      },
      {
        onSuccess: (result) => {
          setExportStatus({
            type: "success",
            message: `Queued ${result.totalClips} clips for generation`,
          });
        },
        onError: (error) => {
          setExportStatus({
            type: "error",
            message: error.message,
          });
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Actions
      </h3>
      <div className="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start"
          onClick={handleMarkAsReviewed}
          disabled={!hasTarget}
        >
          <Check className="mr-2 h-4 w-4" />
          Mark as Reviewed
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start"
          onClick={() => setChangeSpeakerOpen(true)}
          disabled={!hasTarget}
        >
          <User className="mr-2 h-4 w-4" />
          Change Speaker
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start text-red-500 hover:bg-red-500/10 hover:text-red-500 disabled:text-red-500/50"
          onClick={handleDelete}
          disabled={!hasTarget}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {isMultiple ? "Delete Selected" : "Delete"}
        </Button>
      </div>

      {/* Export Section */}
      <div className="space-y-1.5 pt-2">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          Export
        </h3>
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 justify-start"
            onClick={() => handleExportClips(speakerSegmentIds)}
            disabled={!canExport || enqueueGenerationMutation.isPending}
          >
            {enqueueGenerationMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export All ({speakerSegmentIds.length})
          </Button>
        </div>

        {/* Export Status Feedback */}
        {exportStatus && (
          <p
            className={`text-xs ${
              exportStatus.type === "success"
                ? "text-green-600"
                : "text-red-500"
            }`}
          >
            {exportStatus.message}
          </p>
        )}

        {!currentCollection && selectedSpeaker && (
          <p className="text-[10px] text-muted-foreground">
            Select a collection above to enable export
          </p>
        )}
      </div>

      <ChangeSpeakerDialog
        open={changeSpeakerOpen}
        onOpenChange={setChangeSpeakerOpen}
        targetSegmentIds={targetIds}
      />
    </div>
  );
}

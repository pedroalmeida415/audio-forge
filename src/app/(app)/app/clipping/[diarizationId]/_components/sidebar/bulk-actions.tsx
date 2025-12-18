"use client";

import { Check, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import { ChangeSpeakerDialog } from "../dialogs/change-speaker-dialog";

export function BulkActions() {
  const selectedSegmentIds = useClippingStore(
    (s) => s.segments.selectedSegmentIds,
  );
  const diarizationId = useClippingStore((s) => s.segments.diarizationId);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

  const [changeSpeakerOpen, setChangeSpeakerOpen] = useState(false);

  const selectedIds = Array.from(selectedSegmentIds);
  const hasSelection = selectedSegmentIds.size > 0;

  const handleMarkAsReviewed = () => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: selectedIds,
      updates: { isReviewed: true },
    });
  };

  const handleArchiveSelected = () => {
    updateSegmentsMutation.mutate({
      diarizationId,
      segmentIds: selectedIds,
      updates: { isDeleted: true },
    });
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Bulk Actions
      </h3>
      <div className="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start"
          onClick={handleMarkAsReviewed}
          disabled={!hasSelection}
        >
          <Check className="mr-2 h-4 w-4" />
          Mark as Reviewed
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start"
          onClick={() => setChangeSpeakerOpen(true)}
          disabled={!hasSelection}
        >
          <User className="mr-2 h-4 w-4" />
          Change Speaker
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start text-red-500 hover:bg-red-500/10 hover:text-red-500 disabled:text-red-500/50"
          onClick={handleArchiveSelected}
          disabled={!hasSelection}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Selected
        </Button>
      </div>

      <ChangeSpeakerDialog
        open={changeSpeakerOpen}
        onOpenChange={setChangeSpeakerOpen}
        targetSegmentIds={selectedIds}
      />
    </div>
  );
}

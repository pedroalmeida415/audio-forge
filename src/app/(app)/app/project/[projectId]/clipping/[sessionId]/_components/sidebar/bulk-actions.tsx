"use client";

import { useValue } from "@legendapp/state/react";
import { Check, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import { ChangeSpeakerDialog } from "../dialogs/change-speaker-dialog";

/**
 * Bulk actions for checkbox-selected segments.
 *
 * IMPORTANT: This component only operates on segments selected via checkbox
 * (selectedSegmentIds), NOT the active segment (activeSegmentId).
 *
 * - activeSegmentId: Single focused segment in timeline (for timeline actions)
 * - selectedSegmentIds: Checkbox-selected segments (for bulk sidebar actions)
 */
export function SegmentActions() {
  const $store = useClippingStore();

  const fileId = useValue($store.fileId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const updateSegmentsMutation = api.file.updateSegments.useMutation();

  const [changeSpeakerOpen, setChangeSpeakerOpen] = useState(false);

  // Only use checkbox-selected segments, NOT active segment
  const targetIds = Array.from(selectedSegmentIds);
  const hasSelection = targetIds.length > 0;

  const handleMarkAsReviewed = () => {
    if (!hasSelection) return;
    updateSegmentsMutation.mutate({
      fileId,
      segmentIds: targetIds,
      updates: { isReviewed: true },
    });
  };

  const handleDelete = () => {
    if (!hasSelection) return;
    updateSegmentsMutation.mutate({
      fileId,
      segmentIds: targetIds,
      updates: { isDeleted: true },
    });
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
          onClick={handleDelete}
          disabled={!hasSelection}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Selected
        </Button>
      </div>

      <ChangeSpeakerDialog
        open={changeSpeakerOpen}
        onOpenChange={setChangeSpeakerOpen}
        targetSegmentIds={targetIds}
      />
    </div>
  );
}

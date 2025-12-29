"use client";

import { useValue } from "@legendapp/state/react";
import { Check, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";
import { ChangeSpeakerDialog } from "../dialogs/change-speaker-dialog";

export function SegmentActions() {
  const $store = useClippingStore();

  const fileId = useValue($store.fileId);

  const updateSegmentsMutation = api.file.updateSegments.useMutation();

  const [changeSpeakerOpen, setChangeSpeakerOpen] = useState(false);

  // Determine target IDs: selected segments if any, otherwise active segment
  const targetIds = useValue(() => {
    const selectedIds = $store.selectedSegmentIds.get();
    if (selectedIds.size > 0) {
      return Array.from(selectedIds);
    }
    const activeId = $store.activeSegmentId.get();
    if (activeId) {
      return [activeId];
    }
    return [];
  });

  const hasTarget = targetIds.length > 0;
  const isMultiple = targetIds.length > 1;

  const handleMarkAsReviewed = () => {
    updateSegmentsMutation.mutate({
      fileId,
      segmentIds: targetIds,
      updates: { isReviewed: true },
    });
  };

  const handleDelete = () => {
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

      <ChangeSpeakerDialog
        open={changeSpeakerOpen}
        onOpenChange={setChangeSpeakerOpen}
        targetSegmentIds={targetIds}
      />
    </div>
  );
}

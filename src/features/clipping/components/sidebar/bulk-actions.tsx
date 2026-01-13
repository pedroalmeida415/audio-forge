"use client";

import { useValue } from "@legendapp/state/react";
import { Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ChangeSpeakerDialog } from "~/features/clipping/components/dialogs/change-speaker-dialog";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

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

  const sessionId = useValue($store.sessionId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);
  const hasSelection = selectedSegmentIds.size > 0;

  const deleteSegmentsMutation =
    api.clippingSession.deleteSegments.useMutation();

  const [changeSpeakerOpen, setChangeSpeakerOpen] = useState(false);

  const handleDelete = () => {
    if (!hasSelection) return;
    deleteSegmentsMutation.mutate({
      sessionId,
      segmentIds: Array.from(selectedSegmentIds),
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
        targetSegmentIds={Array.from(selectedSegmentIds)}
      />
    </div>
  );
}

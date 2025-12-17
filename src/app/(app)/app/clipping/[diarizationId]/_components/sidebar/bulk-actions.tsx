"use client";

import { Check, Trash2, User } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useClippingWorkspaceStore } from "../../_context/store.context";

export function BulkActions() {
  const selectedSegmentIds = useClippingWorkspaceStore(
    (s) => s.segments.selectedSegmentIds,
  );
  const markAsReviewed = useClippingWorkspaceStore((s) => s.segments.markAsReviewed);
  const archiveSelectedSegments = useClippingWorkspaceStore(
    (s) => s.segments.archiveSelectedSegments,
  );

  const selectedIds = Array.from(selectedSegmentIds);
  const hasSelection = selectedSegmentIds.size > 0;

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
          onClick={() => markAsReviewed(selectedIds)}
          disabled={!hasSelection}
        >
          <Check className="mr-2 h-4 w-4" />
          Mark as Reviewed
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start"
          onClick={() => {
            // TODO: Open speaker selection dialog
            console.log("Change speaker for:", selectedIds);
          }}
          disabled={!hasSelection}
        >
          <User className="mr-2 h-4 w-4" />
          Change Speaker
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-start text-red-500 hover:bg-red-500/10 hover:text-red-500 disabled:text-red-500/50"
          onClick={archiveSelectedSegments}
          disabled={!hasSelection}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Selected
        </Button>
      </div>
    </div>
  );
}

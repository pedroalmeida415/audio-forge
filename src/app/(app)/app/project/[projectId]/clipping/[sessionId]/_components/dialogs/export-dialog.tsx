"use client";

import { useValue } from "@legendapp/state/react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Export dialog for creating clips from selected segments.
 *
 * Shows:
 * - Number of segments to export
 * - Confirmation to create clips
 */
export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const $store = useClippingStore();

  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const createClipsMutation = api.clippingSession.createClips.useMutation();

  // Only export checkbox-selected segments
  const segmentIdsToExport = Array.from(selectedSegmentIds);
  const segmentCount = segmentIdsToExport.length;

  const handleExport = async () => {
    if (segmentCount === 0) return;

    await createClipsMutation.mutateAsync({
      segmentIds: segmentIdsToExport,
    });

    // Clear selection and close dialog
    $store.clearAllSelected();
    onOpenChange(false);
  };

  const isExporting = createClipsMutation.isPending;
  const canExport = segmentCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Create Clips
          </DialogTitle>
          <DialogDescription>
            Create {segmentCount} clip{segmentCount !== 1 ? "s" : ""} from the
            selected segments. Clips will be queued for processing.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-muted-foreground text-sm">
            Each segment will be processed into an audio clip with
            transcription. You can view clip progress in the project dashboard.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!canExport || isExporting}>
            {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create {segmentCount} Clip{segmentCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

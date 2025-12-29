"use client";

import { useValue } from "@legendapp/state/react";
import { FolderPlus, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Export dialog for exporting selected segments to a collection.
 *
 * Shows:
 * - Number of segments to export
 * - Collection selector (existing or create new)
 * - Export button
 */
export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const $store = useClippingStore();

  const fileId = useValue($store.fileId);
  const projectId = useValue($store.projectId);
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const selectedSegmentIds = useValue($store.selectedSegmentIds);
  const segments = useValue($store.segments);

  // Mode: "select" for choosing existing collection, "create" for new collection
  const [mode, setMode] = useState<"select" | "create">("select");
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null);
  const [newCollectionName, setNewCollectionName] = useState("");

  // Fetch existing collections
  const { data: collections, isLoading: collectionsLoading } =
    api.collection.list.useQuery(
      { projectId },
      { enabled: open && !!projectId },
    );

  const createCollectionMutation = api.collection.create.useMutation();
  const exportMutation = api.file.exportToCollection.useMutation();

  const trpcUtils = api.useUtils();

  // Determine which segments to export
  // If segments are selected, export those; otherwise export all for current speaker
  const segmentIdsToExport = (() => {
    if (selectedSegmentIds.size > 0) {
      return Array.from(selectedSegmentIds);
    }
    // Export all non-deleted segments for current speaker
    if (selectedSpeakerId) {
      return segments
        .filter((s) => s.speakerId === selectedSpeakerId && !s.isDeleted)
        .map((s) => s.id);
    }
    return [];
  })();

  const segmentCount = segmentIdsToExport.length;

  const handleExport = async () => {
    if (segmentCount === 0) return;

    let collectionId = selectedCollectionId;

    // Create new collection if needed
    if (mode === "create" && newCollectionName.trim()) {
      const newCollection = await createCollectionMutation.mutateAsync({
        projectId,
        name: newCollectionName.trim(),
      });
      collectionId = newCollection.id;
    }

    if (!collectionId) return;

    // Export segments
    await exportMutation.mutateAsync({
      fileId,
      collectionId,
      segmentIds: segmentIdsToExport,
    });

    // Invalidate collections query
    await trpcUtils.collection.list.invalidate({ projectId });

    // Clear selection and close dialog
    $store.clearAllSelected();
    onOpenChange(false);

    // Reset state
    setMode("select");
    setSelectedCollectionId(null);
    setNewCollectionName("");
  };

  const isExporting =
    createCollectionMutation.isPending || exportMutation.isPending;
  const canExport =
    segmentCount > 0 &&
    (mode === "select" ? !!selectedCollectionId : !!newCollectionName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Export to Collection
          </DialogTitle>
          <DialogDescription>
            Export {segmentCount} segment{segmentCount !== 1 ? "s" : ""} to a
            collection for clip generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "select" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("select")}
              className="flex-1"
            >
              Existing Collection
            </Button>
            <Button
              variant={mode === "create" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("create")}
              className="flex-1"
            >
              <FolderPlus className="mr-1 h-4 w-4" />
              New Collection
            </Button>
          </div>

          {/* Collection selection */}
          {mode === "select" && (
            <div className="space-y-2">
              <Label>Select Collection</Label>
              {collectionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : collections && collections.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border">
                  <div className="p-2">
                    {collections.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        onClick={() => setSelectedCollectionId(collection.id)}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          selectedCollectionId === collection.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {collection.name}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No collections yet
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setMode("create")}
                    className="mt-2"
                  >
                    Create your first collection
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* New collection form */}
          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="collection-name">Collection Name</Label>
              <Input
                id="collection-name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="e.g., Interview Clips"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!canExport || isExporting}>
            {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Export {segmentCount} Segment{segmentCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

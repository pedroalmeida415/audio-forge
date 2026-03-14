"use client";

import { Edit2, Loader2, Trash2, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useWorkspaceUpload } from "~/features/workspace/components/workspace-upload-layer";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

export function SourcePicker() {
  const { projectId } = useParams<{ projectId: string }>();
  const { openFilePicker, isUploading, ingestError, ingestStatus } =
    useWorkspaceUpload();

  const [{ sourceId }, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });

  const [sources] = api.source.listByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const selectedStatus = sourceId ? ingestStatus : null;
  const isIngesting =
    selectedStatus === "pending" || selectedStatus === "processing";

  const utils = api.useUtils();
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState("");
  const [sourceToManage, setSourceToManage] = useState<{ id: string } | null>(
    null,
  );

  const renameMutation = api.source.rename.useMutation({
    onSuccess: () => {
      setShowRename(false);
      void utils.source.listByProject.invalidate();
    },
  });
  const deleteMutation = api.source.delete.useMutation({
    onSuccess: () => {
      setShowDelete(false);
      handleSelectSource(null);
      void utils.source.listByProject.invalidate();
    },
  });

  const handleSelectSource = (id: string | null) => {
    void setQueryState({ sourceId: id, activeSegmentId: null });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-sm">Source:</span>
      <Select
        value={sourceId ?? ""}
        onValueChange={(val) => {
          if (val === "upload") {
            openFilePicker();
          } else if (val === "clear") {
            handleSelectSource(null);
          } else {
            handleSelectSource(val);
          }
        }}
      >
        <SelectTrigger className="h-8 w-[300px] text-xs">
          <SelectValue placeholder="Select a source..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="upload">
              <div className="flex items-center gap-2">
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="size-4 text-muted-foreground" />
                )}
                <span>Upload sources</span>
              </div>
            </SelectItem>
            {sourceId && (
              <SelectItem value="clear" className="text-muted-foreground">
                Clear selection
              </SelectItem>
            )}
            {selectedStatus === "failed" && ingestError && (
              <div className="px-2 py-1 text-destructive text-xs">
                {ingestError}
              </div>
            )}
            {sources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                onRename={(name) => {
                  setSourceToManage(source);
                  setNewName(name);
                  setShowRename(true);
                }}
                onDelete={() => {
                  setSourceToManage(source);
                  setShowDelete(true);
                }}
              />
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {isIngesting && (
        <span className="text-muted-foreground text-xs">(processing)</span>
      )}
      {selectedStatus === "failed" && (
        <span className="text-destructive text-xs">(failed)</span>
      )}
      {sourceToManage && (
        <>
          <Dialog open={showRename} onOpenChange={setShowRename}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename Source</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="source-name">Name</Label>
                  <Input
                    id="source-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim()) {
                        renameMutation.mutate({
                          id: sourceToManage.id,
                          name: newName.trim(),
                        });
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRename(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    renameMutation.mutate({
                      id: sourceToManage.id,
                      name: newName.trim(),
                    })
                  }
                  disabled={!newName.trim() || renameMutation.isPending}
                >
                  {renameMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Source?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this source and all its
                  associated segments and clips. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteMutation.mutate({ id: sourceToManage.id })
                  }
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Delete Source
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function SourceItem({
  source,
  onRename,
  onDelete,
}: {
  source: {
    id: string;
    name: string | null;
    storageKey: string | null;
    duration: number | null;
    status: string | null;
    error: string | null;
    diarizationStatus: string | null;
    createdAt: Date;
  };
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <SelectItem value={source.id} className="group pr-20">
      <span className="flex-1 truncate">
        {source.name ?? source.storageKey?.split("/").pop()}
      </span>
      <div className="absolute right-8 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRename(source.name ?? "");
          }}
        >
          <Edit2 className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </SelectItem>
  );
}

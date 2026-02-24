"use client";

import { Edit2, Loader2, Trash2 } from "lucide-react";
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
import { Separator } from "~/components/ui/separator";
import { workspaceParams } from "~/features/workspace/search-params";
import type { Speaker } from "~/server/db/schema";
import { api } from "~/trpc/react";

export function SpeakerPicker() {
  const { projectId } = useParams<{ projectId: string }>();

  const [{ sourceId, speakerId }, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    speakerId: workspaceParams.speakerId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });

  const [projectSpeakers] = api.speaker.getByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const { data: sourceSpeakers, isLoading: isLoadingSourceSpeakers } =
    api.speaker.getBySource.useQuery(
      { sourceId: sourceId ?? "" },
      { enabled: !!sourceId, refetchOnWindowFocus: false },
    );

  const utils = api.useUtils();
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState("");
  const [speakerToManage, setSpeakerToManage] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const renameMutation = api.speaker.update.useMutation({
    onSuccess: () => {
      setShowRename(false);
      void utils.speaker.getByProject.invalidate();
      void utils.speaker.getBySource.invalidate();
    },
  });
  const deleteMutation = api.speaker.delete.useMutation({
    onSuccess: () => {
      setShowDelete(false);
      handleSelectSpeaker(null);
      void utils.speaker.getByProject.invalidate();
      void utils.speaker.getBySource.invalidate();
    },
  });

  const handleSelectSpeaker = (id: string | null) => {
    void setQueryState({ speakerId: id, activeSegmentId: null });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-sm">Speaker:</span>
      <Select
        value={speakerId ?? ""}
        onValueChange={(val) => {
          if (val === "clear") {
            handleSelectSpeaker(null);
          } else {
            handleSelectSpeaker(val);
          }
        }}
      >
        <SelectTrigger className="h-8 w-[240px] text-xs">
          <SelectValue placeholder="Select a speaker..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {speakerId && (
              <SelectItem value="clear" className="text-muted-foreground">
                Clear selection
              </SelectItem>
            )}
            {projectSpeakers.map((speaker) => (
              <SpeakerItem
                key={speaker.id}
                speaker={speaker}
                onRename={(name) => {
                  setSpeakerToManage({ id: speaker.id, name });
                  setNewName(name);
                  setShowRename(true);
                }}
                onDelete={() => {
                  setSpeakerToManage({ id: speaker.id, name: speaker.name });
                  setShowDelete(true);
                }}
              />
            ))}
            <SourceSpeakersSection
              speakers={sourceSpeakers}
              isLoading={isLoadingSourceSpeakers}
              enabled={!!sourceId}
              onRename={(id, name) => {
                setSpeakerToManage({ id, name });
                setNewName(name);
                setShowRename(true);
              }}
              onDelete={(id) => {
                setSpeakerToManage({ id, name: "" });
                setShowDelete(true);
              }}
            />
          </SelectGroup>
        </SelectContent>
      </Select>
      {speakerToManage && (
        <>
          <Dialog open={showRename} onOpenChange={setShowRename}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename Speaker</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="speaker-name">Name</Label>
                  <Input
                    id="speaker-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim()) {
                        renameMutation.mutate({
                          speakerId: speakerToManage.id,
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
                      speakerId: speakerToManage.id,
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
                <AlertDialogTitle>Delete Speaker?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this speaker and all its
                  associated segments. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteMutation.mutate({ speakerId: speakerToManage.id })
                  }
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Delete Speaker
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function SpeakerItem({
  speaker,
  onRename,
  onDelete,
}: {
  speaker: Speaker;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <SelectItem value={speaker.id} className="group pr-20">
      <div className="flex flex-1 items-center gap-2 truncate">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: speaker.color }}
        />
        <span className="truncate">{speaker.name}</span>
      </div>
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
            onRename(speaker.name);
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

function SourceSpeakersSection({
  speakers,
  isLoading,
  enabled,
  onRename,
  onDelete,
}: {
  speakers: Speaker[] | undefined;
  isLoading: boolean;
  enabled: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!enabled) return null;

  if (isLoading) {
    return (
      <>
        <Separator className="my-1" />
        <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          Loading source speakers...
        </div>
      </>
    );
  }

  if (!speakers?.length) return null;

  return (
    <>
      <Separator className="my-1" />
      <div className="px-2 py-1.5 text-muted-foreground text-xs">
        Source speakers
      </div>
      {speakers.map((speaker) => (
        <SpeakerItem
          key={speaker.id}
          speaker={speaker}
          onRename={(name) => onRename(speaker.id, name)}
          onDelete={() => onDelete(speaker.id)}
        />
      ))}
    </>
  );
}

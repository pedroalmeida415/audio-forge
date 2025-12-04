"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

interface CreateCollectionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, projectId: string) => void;
  initialName?: string;
}

export function CreateCollectionModal({
  open,
  onClose,
  onCreate,
  initialName = "",
}: CreateCollectionModalProps) {
  const [name, setName] = useState(initialName);
  const [projectId, setProjectId] = useState<string>("");

  const { data: projects = [] } = api.project.list.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });

  function handleCreate() {
    if (!(name.trim() && projectId)) return;
    onCreate(name.trim(), projectId);
    setName("");
    setProjectId("");
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      setName("");
      setProjectId("");
    }
  }

  // Update name when initialName changes (when opening modal with search query)
  if (open && initialName && name !== initialName) {
    setName(initialName);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>
            Create a new collection to organize audio clips for a specific
            speaker.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="collection-name">Collection Name</Label>
            <Input
              id="collection-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Speaker 1, John Doe"
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project">Project</Label>
            <Select onValueChange={setProjectId} value={projectId}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No projects found. Create a project first.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!(name.trim() && projectId)} onClick={handleCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

interface CreateCollectionDialogProps {
  projectId: string;
  children: React.ReactNode;
  onCreated?: (collectionId: string) => void;
}

export function CreateCollectionDialog({
  projectId,
  children,
  onCreated,
}: CreateCollectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const utils = api.useUtils();

  const createCollection = api.collection.create.useMutation({
    onSuccess: (collection) => {
      utils.project.getById.invalidate({ id: projectId });
      utils.collection.list.invalidate({ projectId });
      utils.collection.search.invalidate({ projectId });
      setOpen(false);
      setName("");
      setDescription("");
      onCreated?.(collection!.id);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createCollection.mutate({
      projectId,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new speaker collection to organize audio clips.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Speaker Name</Label>
              <Input
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Main narrator voice"
                value={description}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={createCollection.isPending} type="submit">
              {createCollection.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

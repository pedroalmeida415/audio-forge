"use client";

import { Check, ChevronsUpDown, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { useClippingWorkspaceStore } from "../../_context/store.context";

interface CollectionComboboxProps {
  speaker: string;
  diarizationId: string;
  projectId: string;
}

type SpeakerMapping = { collectionId: string; collectionName: string } | null;

export function CollectionCombobox({
  speaker,
  diarizationId,
  projectId,
}: CollectionComboboxProps) {
  const [open, setOpen] = useState(false);

  const speakerCollections = useClippingWorkspaceStore(
    (s) => s.segments.speakerCollections,
  );
  const updateSpeakerCollection = useClippingWorkspaceStore(
    (s) => s.segments.setSpeakerCollection,
  );

  const utils = api.useUtils();

  // Fetch collections for the project
  const { data: collections } = api.collections.list.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  const setSpeakerCollectionMutation =
    api.diarization.setSpeakerCollection.useMutation();

  // Get current mapping for this speaker from the store
  const currentMapping = speakerCollections[speaker];
  const selectedCollectionId = currentMapping?.collectionId;

  const handleSelect = (collectionId: string) => {
    const collection = collections?.find((c) => c.id === collectionId);
    if (!collection) return;

    setSpeakerCollectionMutation.mutate({
      diarizationId,
      speaker,
      collectionId: collection.id,
      collectionName: collection.name,
    });
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Collection
      </h3>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-sm"
            disabled={!collections?.length}
          >
            {selectedCollectionId ? (
              <span className="flex items-center gap-2 truncate">
                <FolderOpen className="h-4 w-4 shrink-0" />
                {currentMapping?.collectionName}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Select collection...
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search collections..." />
            <CommandList>
              <CommandEmpty>No collections found.</CommandEmpty>
              <CommandGroup>
                {collections?.map((collection) => (
                  <CommandItem
                    key={collection.id}
                    value={collection.name}
                    onSelect={() => handleSelect(collection.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedCollectionId === collection.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {collection.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-[10px] text-muted-foreground">
        Clips from this speaker will be exported to the selected collection
      </p>
    </div>
  );
}

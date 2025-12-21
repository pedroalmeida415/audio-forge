"use client";

import { useValue } from "@legendapp/state/react";
import { Check, ChevronsUpDown, FolderOpen, Plus } from "lucide-react";
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
import { useClippingStore } from "../../_context/store.context";

interface CollectionComboboxProps {
  speaker: string;
  diarizationId: string;
  projectId: string;
}

export function CollectionCombobox({
  speaker,
  diarizationId,
  projectId,
}: CollectionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const $store = useClippingStore();
  const speakerCollections = useValue($store.speakerCollections);

  const utils = api.useUtils();

  // Fetch collections for the project
  const { data: collections } = api.collections.list.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  const setSpeakerCollectionMutation =
    api.diarization.setSpeakerCollection.useMutation();

  const createCollectionMutation = api.collections.create.useMutation({
    onSuccess: (newCollection) => {
      utils.collections.list.invalidate({ projectId });
      setSpeakerCollectionMutation.mutate({
        diarizationId,
        speaker,
        collectionId: newCollection.id,
        collectionName: newCollection.name,
      });
      setSearchValue("");
      setOpen(false);
    },
  });

  // Get current mapping for this speaker from the store
  const currentMapping = speakerCollections[speaker];
  const selectedCollectionId = currentMapping?.collectionId;

  // Check if the search value matches any existing collection (case-insensitive)
  const trimmedSearch = searchValue.trim();
  const matchesExisting = collections?.some(
    (c) => c.name.toLowerCase() === trimmedSearch.toLowerCase(),
  );
  const canCreate = trimmedSearch.length > 0 && !matchesExisting;

  const handleSelect = (collectionId: string) => {
    const collection = collections?.find((c) => c.id === collectionId);
    if (!collection) return;

    setSpeakerCollectionMutation.mutate({
      diarizationId,
      speaker,
      collectionId: collection.id,
      collectionName: collection.name,
    });
    setSearchValue("");
    setOpen(false);
  };

  const handleCreate = () => {
    if (!canCreate) return;
    createCollectionMutation.mutate({
      projectId,
      name: trimmedSearch,
    });
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
            disabled={!collections}
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
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or create..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              {!canCreate && collections?.length === 0 && (
                <CommandEmpty>No collections found.</CommandEmpty>
              )}
              <CommandGroup>
                {canCreate && (
                  <CommandItem
                    onSelect={handleCreate}
                    disabled={createCollectionMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{trimmedSearch}"
                  </CommandItem>
                )}
                {collections
                  ?.filter((c) =>
                    c.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
                  )
                  .map((collection) => (
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

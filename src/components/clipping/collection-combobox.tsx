"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { CreateCollectionModal } from "./create-collection-modal";

type CollectionInfo = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

type CollectionComboboxProps = {
  /** ID of currently selected collection */
  selectedCollectionId: string | null;
  /** Callback when collection is selected or unassigned */
  onSelect: (collection: CollectionInfo | null) => void;
  /** Callback to create a new collection */
  onCreateCollection: (name: string, projectId: string) => Promise<void>;
  /** Whether creation is in progress */
  isCreatingCollection?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
};

export function CollectionCombobox({
  selectedCollectionId,
  onSelect,
  onCreateCollection,
  isCreatingCollection,
  compact,
  disabled,
}: CollectionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Use global collection list when no search query
  const { data: allCollections = [] } = api.collection.listAll.useQuery(
    { limit: 20 },
    {
      enabled: !searchQuery,
      refetchOnWindowFocus: false,
    }
  );

  // Use search when query exists
  const { data: searchResults = [] } = api.collection.searchGlobal.useQuery(
    { query: searchQuery, limit: 20 },
    {
      enabled: searchQuery.length >= 1,
      refetchOnWindowFocus: false,
    }
  );

  const collections = searchQuery ? searchResults : allCollections;

  // Find the selected collection from loaded data
  const selectedCollection = selectedCollectionId
    ? collections.find((c) => c.id === selectedCollectionId)
    : null;

  function handleSelect(collection: (typeof collections)[0]) {
    onSelect({
      id: collection.id,
      name: collection.name,
      projectId: collection.project.id,
      projectName: collection.project.name,
    });
    setOpen(false);
    setSearchQuery("");
  }

  function handleUnassign() {
    onSelect(null);
    setOpen(false);
    setSearchQuery("");
  }

  function handleOpenCreateModal() {
    setOpen(false);
    setCreateModalOpen(true);
  }

  async function handleCreateCollection(name: string, projectId: string) {
    await onCreateCollection(name, projectId);
    setCreateModalOpen(false);
    setSearchQuery("");
  }

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className={cn(
              "justify-between",
              compact ? "h-8 w-[160px] text-xs" : "w-full"
            )}
            disabled={disabled || isCreatingCollection}
            role="combobox"
            size="sm"
            variant="outline"
          >
            {selectedCollection ? (
              <span className="truncate">
                {selectedCollection.name}
                {!compact && (
                  <span className="ml-1 text-muted-foreground text-xs">
                    ({selectedCollection.project.name})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {compact ? "Assign..." : "Assign to collection..."}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              onValueChange={setSearchQuery}
              placeholder="Search collections..."
              value={searchQuery}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-2 text-center text-muted-foreground text-sm">
                  No collections found
                </div>
              </CommandEmpty>
              <CommandGroup>
                {selectedCollectionId && (
                  <CommandItem onSelect={handleUnassign} value="__unassign__">
                    <X className="mr-2 h-3 w-3" />
                    Unassign
                  </CommandItem>
                )}
                {collections.map((collection) => (
                  <CommandItem
                    key={collection.id}
                    onSelect={() => handleSelect(collection)}
                    value={`${collection.name}-${collection.project.name}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        selectedCollectionId === collection.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{collection.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {collection.project.name}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={handleOpenCreateModal}>
                  <Plus className="mr-2 h-3 w-3" />
                  Create new collection...
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateCollectionModal
        initialName={searchQuery}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateCollection}
        open={createModalOpen}
      />
    </>
  );
}

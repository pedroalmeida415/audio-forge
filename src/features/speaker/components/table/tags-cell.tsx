"use client";

import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";

interface TagsCellProps {
  tags: string[] | null;
  segmentId: string;
}

export function TagsCell({ tags, segmentId }: TagsCellProps) {
  const $store = useSpeakerPageStore();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const updateTagsMutation = api.segment.updateTags.useMutation({
    onMutate: async ({ tags: newTags }) => {
      // Optimistic update
      $store.updateSegmentTags(segmentId, newTags);
    },
    onError: (_error, _variables, _context) => {
      // Revert on error - restore previous tags
      $store.updateSegmentTags(segmentId, tags ?? []);
    },
  });

  const handleAddTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Don't add duplicate tags
    const currentTags = tags ?? [];
    if (currentTags.includes(trimmed)) {
      setInputValue("");
      return;
    }

    const newTags = [...currentTags, trimmed];
    updateTagsMutation.mutate({ segmentId, tags: newTags });
    setInputValue("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    }
  };

  // Show first 2 tags, then "+N" for overflow
  const visibleTags = tags?.slice(0, 2) ?? [];
  const overflowCount = (tags?.length ?? 0) - 2;

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {visibleTags.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-xs">
          {tag}
        </Badge>
      ))}
      {overflowCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-help text-xs">
              +{overflowCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="flex flex-wrap gap-1">
              {tags?.slice(2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 rounded border border-muted-foreground/50 border-dashed opacity-0 transition-opacity group-hover/row:opacity-100"
            aria-label="Add tag"
          >
            <PlusIcon className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-48 p-2"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter tag..."
            className="h-8 text-sm"
            disabled={updateTagsMutation.isPending}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

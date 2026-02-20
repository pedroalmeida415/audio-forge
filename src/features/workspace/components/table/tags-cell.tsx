"use client";

import { PlusIcon } from "lucide-react";
import { useQueryState } from "nuqs";
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
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

interface TagsCellProps {
  tags: string[] | null;
  segmentId: string;
}

export function TagsCell({ tags, segmentId }: TagsCellProps) {
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId] = useQueryState("speakerId", workspaceParams.speakerId);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  const updateTagsMutation = api.segment.updateTags.useMutation({
    onMutate: async ({ tags: newTags }) => {
      const updateSegmentTags = <
        T extends { id: string; tags: string[] | null },
      >(
        segments: T[],
      ): T[] =>
        segments.map((item) =>
          item.id === segmentId
            ? { ...item, tags: newTags.length > 0 ? newTags : null }
            : item,
        );

      if (sourceId) {
        await utils.segment.getBySource.cancel({ sourceId });
        const previous = utils.segment.getBySource.getData({ sourceId });
        utils.segment.getBySource.setData({ sourceId }, (old) => {
          if (!old) return old;
          return { ...old, segments: updateSegmentTags(old.segments) };
        });
        return { previous, source: "bySource" as const };
      }

      if (speakerId) {
        await utils.segment.getBySpeaker.cancel({ speakerId });
        const previous = utils.segment.getBySpeaker.getData({ speakerId });
        utils.segment.getBySpeaker.setData({ speakerId }, (old) => {
          if (!old) return old;
          return { ...old, segments: updateSegmentTags(old.segments) };
        });
        return { previous, source: "bySpeaker" as const };
      }
    },
    onError: (_err, _vars, context) => {
      if (!context?.previous) return;
      if (context.source === "bySource" && sourceId) {
        utils.segment.getBySource.setData({ sourceId }, context.previous);
      } else if (context.source === "bySpeaker" && speakerId) {
        utils.segment.getBySpeaker.setData({ speakerId }, context.previous);
      }
    },
    onSettled: async () => {
      const invalidations: Promise<unknown>[] = [];

      if (sourceId) {
        invalidations.push(utils.segment.getBySource.invalidate({ sourceId }));
      }

      if (speakerId) {
        invalidations.push(
          utils.segment.getBySpeaker.invalidate({ speakerId }),
        );
      } else {
        invalidations.push(utils.segment.getBySpeaker.invalidate());
      }

      await Promise.all(invalidations);
    },
  });

  const handleAddTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

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

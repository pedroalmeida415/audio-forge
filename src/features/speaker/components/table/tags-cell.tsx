"use client";

import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface TagsCellProps {
  tags: string[] | null;
}

export function TagsCell({ tags }: TagsCellProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  // Show first 2 tags, then "+N" for overflow
  const visibleTags = tags.slice(0, 2);
  const overflowCount = tags.length - 2;

  return (
    <div className="flex flex-wrap items-center gap-1">
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
              {tags.slice(2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

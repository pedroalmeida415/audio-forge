"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

interface TagInputProps {
  tags: string[];
  suggestedTags?: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TagInput({
  tags,
  suggestedTags = [],
  onAddTag,
  onRemoveTag,
  disabled,
  className,
}: TagInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableSuggestions = suggestedTags.filter(
    (t) =>
      !tags.includes(t) && t.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const handleStartAdding = () => {
    setIsAdding(true);
    setInputValue("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAddTag(trimmed);
    }
    setInputValue("");
    setIsAdding(false);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        handleAddTag(inputValue);
      }
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setInputValue("");
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow clicking on suggestions
    setTimeout(() => {
      if (inputValue.trim()) {
        handleAddTag(inputValue);
      } else {
        setIsAdding(false);
        setShowSuggestions(false);
      }
    }, 150);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Tags
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className={cn(
              "cursor-pointer gap-1 pr-1.5 transition-colors hover:bg-destructive/10",
              disabled && "pointer-events-none opacity-50",
            )}
            onClick={() => !disabled && onRemoveTag(tag)}
          >
            {tag}
            <X className="size-3" />
          </Badge>
        ))}

        {isAdding ? (
          <div className="relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Type tag..."
              disabled={disabled}
              className="h-7 w-28 px-2 text-xs"
            />
            {showSuggestions && availableSuggestions.length > 0 && (
              <div className="absolute top-full z-50 mt-1 max-h-32 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {availableSuggestions.slice(0, 5).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddTag(suggestion);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartAdding}
            disabled={disabled}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:border-primary/40 hover:text-primary",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <Plus className="size-3" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useValue } from "@legendapp/state/react";
import { ChevronDown, Filter, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { cn } from "~/lib/utils";

export function FilterBar() {
  const $store = useSpeakerPageStore();
  const filters = useValue($store.filters);
  const allTags = $store.getAllTags();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFiltersCount = [
    filters.hasClip !== null,
    filters.hasTranscription !== null,
    filters.minDuration > 0 || filters.maxDuration < 30,
    filters.minScore > 0,
    filters.selectedTag !== null,
  ].filter(Boolean).length;

  const handleClearAll = () => {
    $store.resetFilters();
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted">
            <Filter className="size-4 text-muted-foreground" />
          </div>
          <span className="font-medium text-sm">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary font-medium font-mono text-[10px] text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t px-4 py-4">
          <div className="flex flex-wrap items-end gap-6">
            {/* Clip Status */}
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Clip Status
              </Label>
              <Select
                value={
                  filters.hasClip === null
                    ? "all"
                    : filters.hasClip
                      ? "has"
                      : "missing"
                }
                onValueChange={(v) =>
                  $store.setFilters({
                    hasClip: v === "all" ? null : v === "has",
                  })
                }
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has clip</SelectItem>
                  <SelectItem value="missing">Missing clip</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transcription */}
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Transcription
              </Label>
              <Select
                value={
                  filters.hasTranscription === null
                    ? "all"
                    : filters.hasTranscription
                      ? "has"
                      : "missing"
                }
                onValueChange={(v) =>
                  $store.setFilters({
                    hasTranscription: v === "all" ? null : v === "has",
                  })
                }
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has transcription</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration Range */}
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Duration: {filters.minDuration}s - {filters.maxDuration}s
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[filters.minDuration, filters.maxDuration]}
                  min={0}
                  max={30}
                  step={0.5}
                  onValueChange={([min, max]) =>
                    $store.setFilters({
                      minDuration: min ?? 0,
                      maxDuration: max ?? 30,
                    })
                  }
                  className="w-44"
                />
              </div>
            </div>

            {/* Min Score */}
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Min Score: {filters.minScore.toFixed(1)}
              </Label>
              <Slider
                value={[filters.minScore]}
                min={0}
                max={5}
                step={0.1}
                onValueChange={([val]) =>
                  $store.setFilters({ minScore: val ?? 0 })
                }
                className="w-36"
              />
            </div>

            {/* Tag Filter */}
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Tag
              </Label>
              <Select
                value={filters.selectedTag ?? "all"}
                onValueChange={(v) =>
                  $store.setFilters({
                    selectedTag: v === "all" ? null : v,
                  })
                }
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                <X className="size-3" />
                Clear all
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

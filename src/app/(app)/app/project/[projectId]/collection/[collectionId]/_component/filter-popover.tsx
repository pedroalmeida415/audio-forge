"use client";

import { Filter, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Slider } from "~/components/ui/slider";
import type { FilterState } from "../_hooks/use-collection-state";

type FilterPopoverProps = {
  filters: FilterState;
  onChange: (filters: Partial<FilterState>) => void;
  onReset: () => void;
  activeFilterCount: number;
  children?: ReactNode;
};

export function FilterPopover({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  children,
}: FilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1 size-5 p-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Filters</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">
                  MOS Score
                </Label>
                <span className="text-muted-foreground text-xs">
                  {filters.mosRange[0]} - {filters.mosRange[1]}
                </span>
              </div>
              <Slider
                min={1}
                max={5}
                step={0.5}
                value={filters.mosRange}
                onValueChange={(value) =>
                  onChange({ mosRange: value as [number, number] })
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">
                  Length (seconds)
                </Label>
                <span className="text-muted-foreground text-xs">
                  {filters.lengthRange[0]}s - {filters.lengthRange[1]}s
                </span>
              </div>
              <Slider
                min={0}
                max={300}
                step={5}
                value={filters.lengthRange}
                onValueChange={(value) =>
                  onChange({ lengthRange: value as [number, number] })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                Transcription
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={
                    filters.hasTranscription === null ? "default" : "outline"
                  }
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange({ hasTranscription: null })}
                >
                  All
                </Button>
                <Button
                  variant={
                    filters.hasTranscription === true ? "default" : "outline"
                  }
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange({ hasTranscription: true })}
                >
                  Has transcript
                </Button>
                <Button
                  variant={
                    filters.hasTranscription === false ? "default" : "outline"
                  }
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange({ hasTranscription: false })}
                >
                  No transcript
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

export type ClipFilters = {
  mosMin?: number;
  mosMax?: number;
  durationMin?: number;
  durationMax?: number;
  sampleRate?: number;
  hasTranscript?: boolean;
  hasProcessed?: boolean;
  readyForExport?: boolean;
  search?: string;
};

export type ClipSort = {
  field: "createdAt" | "mosScore" | "durationSeconds" | "transcript" | "sampleRate";
  order: "asc" | "desc";
};

type ClipFiltersProps = {
  filters: ClipFilters;
  sort: ClipSort;
  onFiltersChange: (filters: ClipFilters) => void;
  onSortChange: (sort: ClipSort) => void;
  sampleRates?: number[];
  className?: string;
};

const SORT_OPTIONS = [
  { value: "createdAt", label: "Date Added" },
  { value: "mosScore", label: "MOS Score" },
  { value: "durationSeconds", label: "Duration" },
  { value: "sampleRate", label: "Sample Rate" },
] as const;

function formatSampleRate(rate: number): string {
  if (rate >= 1000) {
    return `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)} kHz`;
  }
  return `${rate} Hz`;
}

export function ClipFiltersBar({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  sampleRates = [],
  className,
}: ClipFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const hasActiveFilters =
    filters.mosMin !== undefined ||
    filters.mosMax !== undefined ||
    filters.durationMin !== undefined ||
    filters.durationMax !== undefined ||
    filters.sampleRate !== undefined ||
    filters.hasTranscript !== undefined ||
    filters.hasProcessed !== undefined ||
    filters.readyForExport !== undefined;

  const activeFilterCount = [
    filters.mosMin !== undefined || filters.mosMax !== undefined,
    filters.durationMin !== undefined || filters.durationMax !== undefined,
    filters.sampleRate !== undefined,
    filters.hasTranscript !== undefined,
    filters.hasProcessed !== undefined,
    filters.readyForExport !== undefined,
  ].filter(Boolean).length;

  const handleSearchSubmit = useCallback(() => {
    onFiltersChange({
      ...filters,
      search: searchValue.trim() || undefined,
    });
  }, [filters, searchValue, onFiltersChange]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearchSubmit();
      }
    },
    [handleSearchSubmit]
  );

  const handleClearSearch = useCallback(() => {
    setSearchValue("");
    onFiltersChange({
      ...filters,
      search: undefined,
    });
  }, [filters, onFiltersChange]);

  const handleClearFilters = useCallback(() => {
    onFiltersChange({
      search: filters.search,
    });
  }, [filters.search, onFiltersChange]);

  const toggleSortOrder = useCallback(() => {
    onSortChange({
      ...sort,
      order: sort.order === "asc" ? "desc" : "asc",
    });
  }, [sort, onSortChange]);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-8"
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search clips..."
          value={searchValue}
        />
        {searchValue && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={handleClearSearch}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters Popover */}
      <Popover onOpenChange={setIsFiltersOpen} open={isFiltersOpen}>
        <PopoverTrigger asChild>
          <Button
            className="gap-2"
            size="sm"
            variant={hasActiveFilters ? "default" : "outline"}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {hasActiveFilters && (
                <Button
                  className="h-auto p-0 text-xs"
                  onClick={handleClearFilters}
                  variant="link"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* MOS Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">MOS Score</label>
              <div className="flex items-center gap-2">
                <Input
                  className="w-16"
                  max={5}
                  min={1}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      mosMin: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Min"
                  step={0.1}
                  type="number"
                  value={filters.mosMin ?? ""}
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  className="w-16"
                  max={5}
                  min={1}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      mosMax: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Max"
                  step={0.1}
                  type="number"
                  value={filters.mosMax ?? ""}
                />
              </div>
            </div>

            {/* Duration Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Duration (seconds)</label>
              <div className="flex items-center gap-2">
                <Input
                  className="w-16"
                  min={0}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      durationMin: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Min"
                  type="number"
                  value={filters.durationMin ?? ""}
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  className="w-16"
                  min={0}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      durationMax: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Max"
                  type="number"
                  value={filters.durationMax ?? ""}
                />
              </div>
            </div>

            {/* Sample Rate */}
            {sampleRates.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Sample Rate</label>
                <Select
                  onValueChange={(value) =>
                    onFiltersChange({
                      ...filters,
                      sampleRate: value === "all" ? undefined : Number(value),
                    })
                  }
                  value={filters.sampleRate?.toString() ?? "all"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sample rates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sample rates</SelectItem>
                    {sampleRates.map((rate) => (
                      <SelectItem key={rate} value={rate.toString()}>
                        {formatSampleRate(rate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Boolean Filters */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <div className="flex flex-wrap gap-2">
                <FilterToggle
                  active={filters.hasTranscript === true}
                  label="Has Transcript"
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      hasTranscript:
                        filters.hasTranscript === true ? undefined : true,
                    })
                  }
                />
                <FilterToggle
                  active={filters.hasProcessed === true}
                  label="Has Processed"
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      hasProcessed:
                        filters.hasProcessed === true ? undefined : true,
                    })
                  }
                />
                <FilterToggle
                  active={filters.readyForExport === true}
                  label="Ready for Export"
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      readyForExport:
                        filters.readyForExport === true ? undefined : true,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort */}
      <div className="flex items-center gap-1">
        <Select
          onValueChange={(value) =>
            onSortChange({
              ...sort,
              field: value as ClipSort["field"],
            })
          }
          value={sort.field}
        >
          <SelectTrigger className="w-[140px]">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={toggleSortOrder} size="icon" variant="outline">
          {sort.order === "asc" ? (
            <ArrowUpAZ className="h-4 w-4" />
          ) : (
            <ArrowDownAZ className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={onClick}
      type="button"
    >
      {active && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

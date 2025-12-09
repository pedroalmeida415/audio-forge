"use client";

import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckSquare,
  Search,
  Square,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type {
  FilterState,
  SortDirection,
  SortField,
  SortState,
} from "../_hooks/use-collection-state";
import { FilterPopover } from "./filter-popover";

type ToolbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: FilterState;
  onFiltersChange: (filters: Partial<FilterState>) => void;
  onFiltersReset: () => void;
  activeFilterCount: number;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
};

const SORT_OPTIONS: { value: `${SortField}-${SortDirection}`; label: string }[] =
  [
    { value: "date-desc", label: "Newest first" },
    { value: "date-asc", label: "Oldest first" },
    { value: "mosScore-desc", label: "Highest MOS" },
    { value: "mosScore-asc", label: "Lowest MOS" },
    { value: "length-desc", label: "Longest" },
    { value: "length-asc", label: "Shortest" },
  ];

export function Toolbar({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  onFiltersReset,
  activeFilterCount,
  sort,
  onSortChange,
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
}: ToolbarProps) {
  const sortValue = `${sort.field}-${sort.direction}` as const;

  const handleSortChange = (value: string) => {
    const [field, direction] = value.split("-") as [SortField, SortDirection];
    onSortChange({ field, direction });
  };

  const hasSelection = selectedCount > 0;

  return (
    <div className="flex items-center gap-3 border-b px-6 py-3">
      <div className="relative flex-1">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search transcriptions..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 pl-9"
        />
      </div>

      <FilterPopover
        filters={filters}
        onChange={onFiltersChange}
        onReset={onFiltersReset}
        activeFilterCount={activeFilterCount}
      />

      <Select value={sortValue} onValueChange={handleSortChange}>
        <SelectTrigger size="sm" className="w-[140px]">
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={hasSelection ? onDeselectAll : onSelectAll}
      >
        {hasSelection ? (
          <>
            <CheckSquare className="size-4" />
            Deselect ({selectedCount})
          </>
        ) : (
          <>
            <Square className="size-4" />
            Select all
          </>
        )}
      </Button>
    </div>
  );
}

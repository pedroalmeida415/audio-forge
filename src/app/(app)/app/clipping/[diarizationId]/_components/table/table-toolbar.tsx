"use client";

import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { cn } from "~/lib/utils";
import { useClippingWorkspaceStore } from "../../_context/store.context";
import type { SegmentAlertType } from "../../_store/clipping-workspace-store";
import { getFilterCounts, getUniqueSpeakers } from "../../_utils/segment-utils";

const ALL_SPEAKERS_VALUE = "__all__";

interface QuickFilter {
  id: string;
  label: string;
  alertType?: SegmentAlertType;
  reviewedFilter?: boolean;
}

const QUICK_FILTERS: QuickFilter[] = [
  { id: "unreviewed", label: "Unreviewed", reviewedFilter: false },
  { id: "tooLong", label: "Too Long", alertType: "too_long" },
  { id: "tooShort", label: "Too Short", alertType: "too_short" },
];

export function TableToolbar() {
  const segmentsById = useClippingWorkspaceStore((s) => s.segmentsById);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.selectedSpeaker);
  const filters = useClippingWorkspaceStore((s) => s.filters);
  const selectSpeaker = useClippingWorkspaceStore((s) => s.selectSpeaker);
  const setFilters = useClippingWorkspaceStore((s) => s.setFilters);
  const clearFilters = useClippingWorkspaceStore((s) => s.clearFilters);

  // Get unique speakers
  const speakers = useMemo(() => {
    const segments = Object.values(segmentsById);
    return getUniqueSpeakers(segments);
  }, [segmentsById]);

  // Get filter counts
  const filterCounts = useMemo(() => {
    const segments = Object.values(segmentsById);
    return getFilterCounts(segments, selectedSpeaker);
  }, [segmentsById, selectedSpeaker]);

  // Check if any filters are active
  const hasActiveFilters =
    filters.alerts.length > 0 ||
    filters.reviewed !== null ||
    filters.search.trim() !== "";

  // Toggle alert filter
  const toggleAlertFilter = (alertType: SegmentAlertType) => {
    const current = filters.alerts;
    if (current.includes(alertType)) {
      setFilters({ alerts: current.filter((a) => a !== alertType) });
    } else {
      setFilters({ alerts: [...current, alertType] });
    }
  };

  // Toggle reviewed filter
  const toggleReviewedFilter = (reviewed: boolean) => {
    if (filters.reviewed === reviewed) {
      setFilters({ reviewed: null });
    } else {
      setFilters({ reviewed });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Speaker Select */}
        <Select
          value={selectedSpeaker ?? ALL_SPEAKERS_VALUE}
          onValueChange={(value) =>
            selectSpeaker(value === ALL_SPEAKERS_VALUE ? null : value)
          }
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="All Speakers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SPEAKERS_VALUE}>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">All Speakers</span>
              </span>
            </SelectItem>
            {speakers.map((speaker, idx) => {
              const color = getSpeakerColor(idx);
              return (
                <SelectItem key={speaker} value={speaker}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color.border }}
                    />
                    {speaker}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Quick Filters */}
        <div className="flex items-center gap-1.5">
          {QUICK_FILTERS.map((filter) => {
            const count =
              filterCounts[filter.id as keyof typeof filterCounts] ?? 0;
            const isActive = filter.alertType
              ? filters.alerts.includes(filter.alertType)
              : filter.reviewedFilter !== undefined
                ? filters.reviewed === filter.reviewedFilter
                : false;

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  if (filter.alertType) {
                    toggleAlertFilter(filter.alertType);
                  } else if (filter.reviewedFilter !== undefined) {
                    toggleReviewedFilter(filter.reviewedFilter);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    isActive ? "bg-primary/20" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search transcriptions..."
            className="h-8 w-[200px] pl-8 text-xs"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

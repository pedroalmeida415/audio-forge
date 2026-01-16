"use client";

import { useSelector } from "@legendapp/state/react";
import { X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Slider } from "~/components/ui/slider";
import { useSpeakerStore } from "../context/store-context";
import { DEFAULT_FILTERS, type SpeakerFilters } from "../store/speaker-store";

// ============================================================================
// Constants
// ============================================================================

/**
 * Duration range bounds (in seconds)
 */
const DURATION_MIN = 0;
const DURATION_MAX = 60;
const DURATION_STEP = 0.5;

/**
 * MOS score range bounds (1-5 scale)
 */
const MOS_MIN = 1;
const MOS_MAX = 5;
const MOS_STEP = 0.5;

// ============================================================================
// Filter Controls Component
// ============================================================================

/**
 * Filter controls component for segment list.
 *
 * Provides filtering options:
 * - Duration range sliders (min/max seconds)
 * - MOS score range sliders (1-5)
 * - Transcription status radio (all/has/missing)
 * - Clear filters button
 * - Active filter count badge
 *
 * Uses useSpeakerStore() to read filters and dispatch setFilter/clearFilters actions.
 */
export function FilterControls() {
  const $store = useSpeakerStore();

  // Read current filters reactively
  const filters = useSelector(() => $store.filters.get());

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.durationMin !== DEFAULT_FILTERS.durationMin) count++;
    if (filters.durationMax !== DEFAULT_FILTERS.durationMax) count++;
    if (filters.mosMin !== DEFAULT_FILTERS.mosMin) count++;
    if (filters.mosMax !== DEFAULT_FILTERS.mosMax) count++;
    if (filters.transcriptionStatus !== DEFAULT_FILTERS.transcriptionStatus)
      count++;
    return count;
  }, [filters]);

  // Handler for duration min slider
  const handleDurationMinChange = useCallback(
    (values: number[]) => {
      const value = values[0];
      if (value !== undefined) {
        $store.setFilter("durationMin", value === DURATION_MIN ? null : value);
      }
    },
    [$store],
  );

  // Handler for duration max slider
  const handleDurationMaxChange = useCallback(
    (values: number[]) => {
      const value = values[0];
      if (value !== undefined) {
        $store.setFilter("durationMax", value === DURATION_MAX ? null : value);
      }
    },
    [$store],
  );

  // Handler for MOS min slider
  const handleMosMinChange = useCallback(
    (values: number[]) => {
      const value = values[0];
      if (value !== undefined) {
        $store.setFilter("mosMin", value === MOS_MIN ? null : value);
      }
    },
    [$store],
  );

  // Handler for MOS max slider
  const handleMosMaxChange = useCallback(
    (values: number[]) => {
      const value = values[0];
      if (value !== undefined) {
        $store.setFilter("mosMax", value === MOS_MAX ? null : value);
      }
    },
    [$store],
  );

  // Handler for transcription status change
  const handleTranscriptionStatusChange = useCallback(
    (value: string) => {
      $store.setFilter(
        "transcriptionStatus",
        value as SpeakerFilters["transcriptionStatus"],
      );
    },
    [$store],
  );

  // Handler for clearing all filters
  const handleClearFilters = useCallback(() => {
    $store.clearFilters();
  }, [$store]);

  // Format duration value for display
  const formatDuration = (value: number | null, fallback: string): string => {
    if (value === null) return fallback;
    return `${value.toFixed(1)}s`;
  };

  // Format MOS value for display
  const formatMos = (value: number | null, fallback: string): string => {
    if (value === null) return fallback;
    return value.toFixed(1);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border/50 bg-card/50 p-4">
      {/* Header with title and clear button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-7 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Duration range sliders */}
      <div className="flex flex-col gap-3">
        <Label className="text-muted-foreground text-xs">Duration Range</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span>Min: {formatDuration(filters.durationMin, "0s")}</span>
            <span>Max: {formatDuration(filters.durationMax, "60s")}</span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <Slider
                min={DURATION_MIN}
                max={DURATION_MAX}
                step={DURATION_STEP}
                value={[filters.durationMin ?? DURATION_MIN]}
                onValueChange={handleDurationMinChange}
              />
            </div>
            <div className="flex-1">
              <Slider
                min={DURATION_MIN}
                max={DURATION_MAX}
                step={DURATION_STEP}
                value={[filters.durationMax ?? DURATION_MAX]}
                onValueChange={handleDurationMaxChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MOS score range sliders */}
      <div className="flex flex-col gap-3">
        <Label className="text-muted-foreground text-xs">MOS Score Range</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span>Min: {formatMos(filters.mosMin, "1.0")}</span>
            <span>Max: {formatMos(filters.mosMax, "5.0")}</span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <Slider
                min={MOS_MIN}
                max={MOS_MAX}
                step={MOS_STEP}
                value={[filters.mosMin ?? MOS_MIN]}
                onValueChange={handleMosMinChange}
              />
            </div>
            <div className="flex-1">
              <Slider
                min={MOS_MIN}
                max={MOS_MAX}
                step={MOS_STEP}
                value={[filters.mosMax ?? MOS_MAX]}
                onValueChange={handleMosMaxChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transcription status radio group */}
      <div className="flex flex-col gap-3">
        <Label className="text-muted-foreground text-xs">Transcription</Label>
        <RadioGroup
          value={filters.transcriptionStatus}
          onValueChange={handleTranscriptionStatusChange}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="transcription-all" />
            <Label htmlFor="transcription-all" className="cursor-pointer">
              All
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="has" id="transcription-has" />
            <Label htmlFor="transcription-has" className="cursor-pointer">
              Has
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="missing" id="transcription-missing" />
            <Label htmlFor="transcription-missing" className="cursor-pointer">
              Missing
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

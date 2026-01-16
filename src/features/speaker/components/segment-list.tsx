"use client";

import { useSelector } from "@legendapp/state/react";
import { ListFilter } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { DEFAULT_FILTERS, type SpeakerFilters } from "../store/speaker-store";
import { useSpeakerStore } from "../context/store-context";
import { SegmentUnitCard } from "./segment-unit-card";

/**
 * Count the number of active filters (non-default values)
 */
function countActiveFilters(filters: SpeakerFilters): number {
  let count = 0;

  if (filters.durationMin !== DEFAULT_FILTERS.durationMin) count++;
  if (filters.durationMax !== DEFAULT_FILTERS.durationMax) count++;
  if (filters.mosMin !== DEFAULT_FILTERS.mosMin) count++;
  if (filters.mosMax !== DEFAULT_FILTERS.mosMax) count++;
  if (filters.transcriptionStatus !== DEFAULT_FILTERS.transcriptionStatus)
    count++;

  return count;
}

/**
 * Segment list component.
 *
 * Renders a list of segment unit cards for all filtered segments.
 * Includes a header with filter controls placeholder and active filter count badge.
 */
export function SegmentList() {
  const $store = useSpeakerStore();

  // Subscribe to reactive state
  const filteredSegments = useSelector(() => $store.filteredSegments());
  const selectedSegmentIds = useSelector($store.selectedSegmentIds);
  const filters = useSelector($store.filters);

  const activeFilterCount = countActiveFilters(filters);

  // Callbacks
  const handleToggleSelect = (segmentId: string) => {
    $store.toggleSegmentSelection(segmentId);
  };

  const handleDeleteClip = (clipId: string) => {
    // TODO: Implement clip deletion mutation
    console.log("Delete clip:", clipId);
  };

  const handleTranscriptionChange = (segmentId: string, text: string) => {
    $store.updateTranscription(segmentId, text);
    // TODO: Add tRPC mutation to persist transcription
  };

  return (
    <div className="flex h-full flex-col">
      {/* List Header */}
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Segments</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0.5 text-xs">
              {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {/* Filter controls placeholder - will be implemented in task 1.38 */}
        <div className="text-muted-foreground text-xs">
          {filteredSegments.length} segment
          {filteredSegments.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Segment List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSegments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ListFilter className="h-8 w-8" />
            <p className="text-sm">No segments match filters</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredSegments.map((segment) => (
              <SegmentUnitCard
                key={segment.id}
                segment={segment}
                isSelected={selectedSegmentIds.has(segment.id)}
                onToggleSelect={() => handleToggleSelect(segment.id)}
                onDeleteClip={handleDeleteClip}
                onTranscriptionChange={(text) =>
                  handleTranscriptionChange(segment.id, text)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

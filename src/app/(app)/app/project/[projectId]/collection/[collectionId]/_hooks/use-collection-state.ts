"use client";

import { useCallback, useMemo, useState } from "react";
import type { RouterOutputs } from "~/trpc/react";

type ClipFromRouter = RouterOutputs["clips"]["listByCollection"][number];

export interface ClipWithMockedFields extends ClipFromRouter {
  duration: number;
  processedClip: {
    duration: number;
    mosScore: number | null;
  } | null;
}

export interface FilterState {
  mosRange: [number, number];
  lengthRange: [number, number];
  hasTranscription: boolean | null;
}

export type SortField = "date" | "mosScore" | "length";
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

const DEFAULT_FILTERS: FilterState = {
  mosRange: [1, 5],
  lengthRange: [0, 300],
  hasTranscription: null,
};

const DEFAULT_SORT: SortState = {
  field: "date",
  direction: "desc",
};

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export function enrichClipsWithMockData(
  clips: ClipFromRouter[]
): ClipWithMockedFields[] {
  return clips.map((clip) => {
    const rand1 = seededRandom(clip.id);
    const rand2 = seededRandom(`${clip.id}processed`);
    const rand3 = seededRandom(`${clip.id}mos`);

    return {
      ...clip,
      duration: Math.floor(rand1 * 30) + 5,
      processedClip:
        rand2 > 0.5
          ? {
              duration: Math.floor(rand1 * 28) + 4,
              mosScore: rand3 > 0.3 ? Math.round((rand3 * 3 + 2) * 10) / 10 : null,
            }
          : null,
    };
  });
}

interface UseCollectionStateProps {
  clips: ClipWithMockedFields[];
}

export function useCollectionState({ clips }: UseCollectionStateProps) {
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFiltersState] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSortState] = useState<SortState>(DEFAULT_SORT);

  const filteredClips = useMemo(() => {
    return clips
      .filter((clip) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesTranscript = clip.transcript
            ?.toLowerCase()
            .includes(query);
          if (!matchesTranscript) return false;
        }

        if (clip.mosScore !== null) {
          if (
            clip.mosScore < filters.mosRange[0] ||
            clip.mosScore > filters.mosRange[1]
          ) {
            return false;
          }
        }

        if (
          clip.duration < filters.lengthRange[0] ||
          clip.duration > filters.lengthRange[1]
        ) {
          return false;
        }

        if (filters.hasTranscription !== null) {
          const hasTranscript = !!clip.transcript;
          if (filters.hasTranscription !== hasTranscript) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const direction = sort.direction === "asc" ? 1 : -1;
        switch (sort.field) {
          case "date":
            return (
              direction * (a.createdAt.getTime() - b.createdAt.getTime())
            );
          case "mosScore":
            return direction * ((a.mosScore ?? 0) - (b.mosScore ?? 0));
          case "length":
            return direction * (a.duration - b.duration);
          default:
            return 0;
        }
      });
  }, [clips, searchQuery, filters, sort]);

  const setActiveClip = useCallback((id: string | null) => {
    setActiveClipId((prev) => (prev === id ? null : id));
  }, []);

  const toggleClipSelection = useCallback((id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedClipIds(new Set(filteredClips.map((c) => c.id)));
  }, [filteredClips]);

  const deselectAll = useCallback(() => {
    setSelectedClipIds(new Set());
  }, []);

  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);

  const setSort = useCallback((newSort: SortState) => {
    setSortState(newSort);
  }, []);

  const activeClip = useMemo(
    () => clips.find((c) => c.id === activeClipId) ?? null,
    [clips, activeClipId]
  );

  const selectedClips = useMemo(
    () => clips.filter((c) => selectedClipIds.has(c.id)),
    [clips, selectedClipIds]
  );

  const hasActiveOrSelected =
    activeClipId !== null || selectedClipIds.size > 0;
  const isMultiSelect = selectedClipIds.size > 1;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (
      filters.mosRange[0] !== DEFAULT_FILTERS.mosRange[0] ||
      filters.mosRange[1] !== DEFAULT_FILTERS.mosRange[1]
    ) {
      count++;
    }
    if (
      filters.lengthRange[0] !== DEFAULT_FILTERS.lengthRange[0] ||
      filters.lengthRange[1] !== DEFAULT_FILTERS.lengthRange[1]
    ) {
      count++;
    }
    if (filters.hasTranscription !== null) {
      count++;
    }
    return count;
  }, [filters]);

  return {
    activeClipId,
    activeClip,
    selectedClipIds,
    selectedClips,
    filteredClips,
    hasActiveOrSelected,
    isMultiSelect,
    searchQuery,
    filters,
    sort,
    activeFilterCount,
    setActiveClip,
    toggleClipSelection,
    selectAll,
    deselectAll,
    setSearchQuery,
    setFilters,
    resetFilters,
    setSort,
  };
}

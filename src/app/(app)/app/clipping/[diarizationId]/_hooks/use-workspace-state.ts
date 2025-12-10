"use client";

import { useCallback, useMemo, useState } from "react";

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SpeakerMetadata {
  id: string;
  label: string;
  segmentCount: number;
  totalDuration: number;
  percentage: number;
  colorIndex: number;
}

interface UseWorkspaceStateOptions {
  segments: DiarizationSegment[];
  totalDuration: number;
}

export function useWorkspaceState({
  segments,
  totalDuration,
}: UseWorkspaceStateOptions) {
  // Get unique speakers in order of first appearance
  const speakerOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const segment of segments) {
      if (!seen.has(segment.speaker)) {
        seen.add(segment.speaker);
        order.push(segment.speaker);
      }
    }
    return order;
  }, [segments]);

  // Calculate speaker metadata
  const speakers = useMemo<SpeakerMetadata[]>(() => {
    const speakerMap = new Map<
      string,
      { segmentCount: number; totalDuration: number }
    >();

    for (const segment of segments) {
      const existing = speakerMap.get(segment.speaker) ?? {
        segmentCount: 0,
        totalDuration: 0,
      };
      speakerMap.set(segment.speaker, {
        segmentCount: existing.segmentCount + 1,
        totalDuration: existing.totalDuration + (segment.end - segment.start),
      });
    }

    return speakerOrder.map((speaker, index) => {
      const data = speakerMap.get(speaker) ?? {
        segmentCount: 0,
        totalDuration: 0,
      };
      return {
        id: speaker,
        label: speaker,
        segmentCount: data.segmentCount,
        totalDuration: data.totalDuration,
        percentage:
          totalDuration > 0 ? (data.totalDuration / totalDuration) * 100 : 0,
        colorIndex: index,
      };
    });
  }, [segments, speakerOrder, totalDuration]);

  // Selection state - default to first speaker
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(
    speakerOrder[0] ?? null,
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );

  // Add segment IDs for easier tracking
  const segmentsWithIds = useMemo(() => {
    return segments.map((segment, index) => ({
      ...segment,
      id: `${segment.speaker}-${index}-${segment.start}-${segment.end}`,
    }));
  }, [segments]);

  // Filter segments for selected speaker
  const filteredSegments = useMemo(() => {
    if (!selectedSpeaker) return segmentsWithIds;
    return segmentsWithIds.filter((s) => s.speaker === selectedSpeaker);
  }, [segmentsWithIds, selectedSpeaker]);

  // Get speaker color index for a segment
  const getSpeakerColorIndex = useCallback(
    (speaker: string): number => {
      const index = speakerOrder.indexOf(speaker);
      return index >= 0 ? index : 0;
    },
    [speakerOrder],
  );

  // Select speaker and optionally clear segment selection
  const selectSpeaker = useCallback((speaker: string | null) => {
    setSelectedSpeaker(speaker);
    setSelectedSegmentId(null);
  }, []);

  // Select a segment (and update speaker if needed)
  const selectSegment = useCallback(
    (segmentId: string | null) => {
      setSelectedSegmentId(segmentId);
      if (segmentId) {
        const segment = segmentsWithIds.find((s) => s.id === segmentId);
        if (segment && segment.speaker !== selectedSpeaker) {
          setSelectedSpeaker(segment.speaker);
        }
      }
    },
    [segmentsWithIds, selectedSpeaker],
  );

  // Find segment by ID
  const getSegmentById = useCallback(
    (segmentId: string) => {
      return segmentsWithIds.find((s) => s.id === segmentId);
    },
    [segmentsWithIds],
  );

  // Get next/prev segment for navigation
  const getAdjacentSegment = useCallback(
    (direction: "next" | "prev"): typeof segmentsWithIds[0] | null => {
      if (!selectedSegmentId) {
        return direction === "next" ? filteredSegments[0] ?? null : null;
      }

      const currentIndex = filteredSegments.findIndex(
        (s) => s.id === selectedSegmentId,
      );
      if (currentIndex === -1) return null;

      const newIndex =
        direction === "next" ? currentIndex + 1 : currentIndex - 1;
      return filteredSegments[newIndex] ?? null;
    },
    [filteredSegments, selectedSegmentId],
  );

  return {
    // Data
    speakers,
    segments: segmentsWithIds,
    filteredSegments,
    speakerOrder,

    // Selection
    selectedSpeaker,
    selectedSegmentId,
    selectSpeaker,
    selectSegment,

    // Helpers
    getSpeakerColorIndex,
    getSegmentById,
    getAdjacentSegment,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

import type { FileSegment, WorkspaceSpeaker } from "~/server/db/schema";

// ============================================================================
// Duration Thresholds (used for visual styling)
// ============================================================================

export const DURATION_THRESHOLDS = {
  TOO_LONG: 15, // seconds
  TOO_SHORT: 1, // seconds
} as const;

// ============================================================================
// Segment Utilities
// ============================================================================

export function getSegmentDuration(segment: {
  start: number;
  end: number;
}): number {
  return segment.end - segment.start;
}

// ============================================================================
// Statistics Functions
// ============================================================================

export interface SegmentStats {
  speakerCount: number;
  segmentCount: number;
  reviewedCount: number;
  totalDuration: number;
  avgDuration: number;
}

export function calculateStats(segments: FileSegment[]): SegmentStats {
  const visibleSegments = segments.filter((s) => !s.isDeleted);
  const speakers = new Set(visibleSegments.map((s) => s.speakerId));

  const totalDuration = visibleSegments.reduce(
    (sum, s) => sum + getSegmentDuration(s),
    0,
  );

  const reviewedCount = visibleSegments.filter((s) => s.isReviewed).length;

  return {
    speakerCount: speakers.size,
    segmentCount: visibleSegments.length,
    reviewedCount,
    totalDuration,
    avgDuration:
      visibleSegments.length > 0 ? totalDuration / visibleSegments.length : 0,
  };
}

/**
 * Get duration distribution histogram for chart
 * Returns array of counts for buckets: [0-1s, 1-3s, 3-5s, 5-8s, 8-12s, 12-15s, 15-20s, 20-30s, 30s+]
 */
export function getDurationDistribution(segments: FileSegment[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const thresholds = [1, 3, 5, 8, 12, 15, 20, 30];

  for (const segment of segments.filter((s) => !s.isDeleted)) {
    const duration = getSegmentDuration(segment);
    let bucketIndex = thresholds.findIndex((t) => duration < t);
    if (bucketIndex === -1) {
      bucketIndex = buckets.length - 1;
    }
    // bucketIndex is guaranteed to be in range [0, buckets.length - 1]
    // biome-ignore lint/style/noNonNullAssertion: bucketIndex is always valid
    buckets[bucketIndex]!++;
  }

  return buckets;
}

// ============================================================================
// Selection Helpers
// ============================================================================

export function getSelectedSegmentsData(
  segmentsById: Record<string, FileSegment>,
  selectedIds: Set<string>,
): {
  segments: FileSegment[];
  totalDuration: number;
  avgLength: number;
} {
  const segments = Array.from(selectedIds)
    .map((id) => segmentsById[id])
    .filter((s): s is FileSegment => s !== undefined && !s.isDeleted);

  const totalDuration = segments.reduce(
    (sum, s) => sum + getSegmentDuration(s),
    0,
  );

  return {
    segments,
    totalDuration,
    avgLength: segments.length > 0 ? totalDuration / segments.length : 0,
  };
}

// ============================================================================
// Speaker Helpers
// ============================================================================

export function getUniqueSpeakerIds(segments: FileSegment[]): string[] {
  const speakerIds = new Set<string>();
  for (const segment of segments) {
    if (!segment.isDeleted) {
      speakerIds.add(segment.speakerId);
    }
  }
  return Array.from(speakerIds);
}

export function getSpeakerLabel(
  speakerId: string,
  speakers: WorkspaceSpeaker[],
): string {
  const speaker = speakers.find((s) => s.id === speakerId);
  return speaker?.label ?? speakerId;
}

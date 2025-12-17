import type {
  FilterConfig,
  SegmentWithId,
  SpeakerCollections,
} from "../_store/clipping-workspace-store";

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

/**
 * Get duration of a segment in seconds
 */
export function getSegmentDuration(segment: SegmentWithId): number {
  return segment.end - segment.start;
}

// ============================================================================
// Filtering Functions
// ============================================================================

/**
 * Filter segments based on filter configuration and selected speaker
 */
export function filterSegments(
  segments: SegmentWithId[],
  filters: FilterConfig,
  selectedSpeaker: string | null,
): SegmentWithId[] {
  return segments.filter((segment) => {
    // Filter out deleted segments
    if (segment.isDeleted) {
      return false;
    }

    // Filter by speaker
    if (selectedSpeaker && segment.speaker !== selectedSpeaker) {
      return false;
    }

    // Filter by reviewed status
    if (filters.reviewed !== null) {
      const isReviewed = segment.isReviewed ?? false;
      if (filters.reviewed !== isReviewed) {
        return false;
      }
    }

    return true;
  });
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

/**
 * Calculate statistics from segments
 */
export function calculateStats(segments: SegmentWithId[]): SegmentStats {
  const visibleSegments = segments.filter((s) => !s.isDeleted);
  const speakers = new Set(visibleSegments.map((s) => s.speaker));

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
export function getDurationDistribution(segments: SegmentWithId[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const thresholds = [1, 3, 5, 8, 12, 15, 20, 30];

  for (const segment of segments.filter((s) => !s.isDeleted)) {
    const duration = getSegmentDuration(segment);
    let bucketIndex = thresholds.findIndex((t) => duration < t);
    if (bucketIndex === -1) {
      bucketIndex = buckets.length - 1;
    }
    buckets[bucketIndex]++;
  }

  return buckets;
}

// ============================================================================
// Selection Helpers
// ============================================================================

/**
 * Get data for selected segments
 */
export function getSelectedSegmentsData(
  segmentsById: Record<string, SegmentWithId>,
  selectedIds: Set<string>,
): {
  segments: SegmentWithId[];
  totalDuration: number;
  avgLength: number;
} {
  const segments = Array.from(selectedIds)
    .map((id) => segmentsById[id])
    .filter((s): s is SegmentWithId => s !== undefined && !s.isDeleted);

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

/**
 * Get unique speakers from segments
 */
export function getUniqueSpeakers(segments: SegmentWithId[]): string[] {
  const speakers = new Set<string>();
  for (const segment of segments) {
    if (!segment.isDeleted) {
      speakers.add(segment.speaker);
    }
  }
  return Array.from(speakers).sort();
}

/**
 * Get display name for a speaker - shows collection name if assigned, otherwise speaker name
 */
export function getSpeakerDisplayName(
  speaker: string,
  speakerCollections: SpeakerCollections,
): string {
  return speakerCollections[speaker]?.collectionName ?? speaker;
}

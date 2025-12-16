import type {
  FilterConfig,
  SegmentAlertType,
  SegmentWithId,
  SortConfig,
  SpeakerCollections,
} from "../_store/clipping-workspace-store";

// ============================================================================
// Alert Thresholds
// ============================================================================

export const ALERT_THRESHOLDS = {
  TOO_LONG: 15, // seconds
  TOO_SHORT: 1, // seconds
} as const;

// ============================================================================
// Alert Functions
// ============================================================================

/**
 * Get duration of a segment in seconds
 */
export function getSegmentDuration(segment: SegmentWithId): number {
  return segment.end - segment.start;
}

/**
 * Get alerts for a segment based on its properties
 */
export function getSegmentAlerts(segment: SegmentWithId): SegmentAlertType[] {
  const alerts: SegmentAlertType[] = [];
  const duration = getSegmentDuration(segment);

  if (duration > ALERT_THRESHOLDS.TOO_LONG) {
    alerts.push("too_long");
  }

  if (duration < ALERT_THRESHOLDS.TOO_SHORT) {
    alerts.push("too_short");
  }

  // No text alert - for now, all segments have no transcription
  // In the future, check segment.transcription
  alerts.push("no_text");

  return alerts;
}

/**
 * Check if a segment has a specific alert type
 */
export function segmentHasAlert(
  segment: SegmentWithId,
  alertType: SegmentAlertType,
): boolean {
  return getSegmentAlerts(segment).includes(alertType);
}

/**
 * Check if a segment has any alerts
 */
export function segmentHasAnyAlert(segment: SegmentWithId): boolean {
  const alerts = getSegmentAlerts(segment);
  // Filter out "no_text" since all segments currently have it
  return alerts.some((a) => a !== "no_text");
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

    // Filter by alerts
    if (filters.alerts.length > 0) {
      const segmentAlerts = getSegmentAlerts(segment);
      const hasMatchingAlert = filters.alerts.some((alert) =>
        segmentAlerts.includes(alert),
      );
      if (!hasMatchingAlert) {
        return false;
      }
    }

    // Filter by reviewed status
    if (filters.reviewed !== null) {
      const isReviewed = segment.isReviewed ?? false;
      if (filters.reviewed !== isReviewed) {
        return false;
      }
    }

    // Filter by search text (placeholder - would search transcription)
    if (filters.search.trim()) {
      // For now, no transcription to search
      // In the future: return segment.transcription?.toLowerCase().includes(filters.search.toLowerCase())
      return true;
    }

    return true;
  });
}

/**
 * Get visible segments (non-deleted only)
 */
export function getVisibleSegments(segments: SegmentWithId[]): SegmentWithId[] {
  return segments.filter((s) => !s.isDeleted);
}

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sort segments based on sort configuration
 */
export function sortSegments(
  segments: SegmentWithId[],
  sortBy: SortConfig | null,
): SegmentWithId[] {
  if (!sortBy) {
    // Default sort: by start time
    return [...segments].sort((a, b) => a.start - b.start);
  }

  const sorted = [...segments];
  const { column, direction } = sortBy;
  const multiplier = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (column) {
      case "duration": {
        const durationA = getSegmentDuration(a);
        const durationB = getSegmentDuration(b);
        return (durationA - durationB) * multiplier;
      }
      case "reviewed": {
        const reviewedA = a.isReviewed ? 1 : 0;
        const reviewedB = b.isReviewed ? 1 : 0;
        return (reviewedA - reviewedB) * multiplier;
      }
      case "alerts": {
        const alertsA = getSegmentAlerts(a).length;
        const alertsB = getSegmentAlerts(b).length;
        return (alertsA - alertsB) * multiplier;
      }
      default:
        return 0;
    }
  });

  return sorted;
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
  alertCounts: Record<SegmentAlertType, number>;
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

  const alertCounts: Record<SegmentAlertType, number> = {
    too_long: 0,
    too_short: 0,
    no_text: 0,
  };

  for (const segment of visibleSegments) {
    const alerts = getSegmentAlerts(segment);
    for (const alert of alerts) {
      alertCounts[alert]++;
    }
  }

  return {
    speakerCount: speakers.size,
    segmentCount: visibleSegments.length,
    reviewedCount,
    totalDuration,
    avgDuration:
      visibleSegments.length > 0 ? totalDuration / visibleSegments.length : 0,
    alertCounts,
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
// Filter Counts
// ============================================================================

/**
 * Get counts for each filter option
 */
export function getFilterCounts(
  segments: SegmentWithId[],
  selectedSpeaker: string | null,
): Record<string, number> {
  const visibleSegments = segments
    .filter((s) => !s.isDeleted)
    .filter((s) => !selectedSpeaker || s.speaker === selectedSpeaker);

  return {
    unreviewed: visibleSegments.filter((s) => !s.isReviewed).length,
    hasAlerts: visibleSegments.filter((s) => segmentHasAnyAlert(s)).length,
    tooLong: visibleSegments.filter((s) => segmentHasAlert(s, "too_long"))
      .length,
    tooShort: visibleSegments.filter((s) => segmentHasAlert(s, "too_short"))
      .length,
    noText: visibleSegments.filter((s) => segmentHasAlert(s, "no_text")).length,
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

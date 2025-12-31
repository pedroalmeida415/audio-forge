import type { WorkspaceSpeaker } from "~/server/db/schema";

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

export function getSpeakerLabel(
  speakerId: string,
  speakers: WorkspaceSpeaker[],
): string {
  const speaker = speakers.find((s) => s.id === speakerId);
  return speaker?.label ?? speakerId;
}

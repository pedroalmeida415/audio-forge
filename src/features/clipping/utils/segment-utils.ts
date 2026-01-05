import type { Speaker } from "~/server/db/schema";

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
  startTime: number;
  endTime: number;
}): number {
  return segment.endTime - segment.startTime;
}

export function getSpeakerName(speakerId: string, speakers: Speaker[]): string {
  const speaker = speakers.find((s) => s.id === speakerId);
  return speaker?.name ?? speakerId;
}

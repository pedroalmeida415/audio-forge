import type {
  ClippingStoreInitialData,
  SegmentWithSpeaker,
} from "~/features/clipping/store/clipping-store";
import type { Speaker } from "~/server/db/schema";

// ============================================================================
// State Overrides - for testing different visual states
// ============================================================================

export interface StoreStateOverrides {
  currentTime?: number;
  isPlaying?: boolean;
  zoomLevel?: number;
  scrollOffset?: number;
  selectedSpeakerId?: string | null;
  activeSegmentId?: string | null;
}

// ============================================================================
// Test Data Helpers
// ============================================================================

export function createMockSpeaker(
  id: string,
  name: string,
  color?: string,
): Speaker {
  return {
    id,
    projectId: "mock-project",
    userId: "mock-user",
    name,
    color: color ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createMockSegment(
  id: string,
  speaker: Speaker,
  startTime: number,
  endTime: number,
): SegmentWithSpeaker {
  return {
    id,
    sessionId: "mock-session",
    speakerId: speaker.id,
    startTime,
    endTime,
    createdAt: new Date(),
    updatedAt: new Date(),
    speaker,
  };
}

/**
 * Helper to create initialData for stories.
 */
export function createInitialData(
  overrides: Partial<{
    segments: SegmentWithSpeaker[];
    speakers: Speaker[];
    duration: number;
  }> = {},
): ClippingStoreInitialData {
  const speakers = overrides.speakers ?? [];
  const segments = overrides.segments ?? [];
  const duration = overrides.duration ?? 120;

  return {
    session: {
      id: "mock-session",
      fileId: "mock-file",
      projectId: "mock-project",
      segments,
      speakers,
    },
    audio: {
      storageKey: "mock-storage-key",
      duration,
    },
  };
}

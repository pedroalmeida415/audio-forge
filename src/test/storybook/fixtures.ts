/**
 * Storybook fixtures for seeding the mock database
 *
 * These fixtures provide test data for stories without using MSW.
 * Data is seeded directly into the in-memory SQLite database.
 */

import type { FileSegment, WorkspaceSpeaker } from "~/types/workspace";

// ============================================================================
// Test IDs
// ============================================================================

export const TEST_IDS = {
  project: "test-project-id",
  file: "test-file-id",
  user: "mock-user-id",
  speakers: {
    speaker00: "speaker-00-id",
    speaker01: "speaker-01-id",
  },
  segments: {
    segment1: "segment-1-id",
    segment2: "segment-2-id",
    segment3: "segment-3-id",
    segment4: "segment-4-id",
  },
};

// ============================================================================
// Speakers
// ============================================================================

export const mockSpeakers: WorkspaceSpeaker[] = [
  {
    id: TEST_IDS.speakers.speaker00,
    label: "SPEAKER_00",
    createdAt: new Date("2024-01-01T12:00:00Z").toISOString(),
  },
  {
    id: TEST_IDS.speakers.speaker01,
    label: "SPEAKER_01",
    createdAt: new Date("2024-01-01T12:00:01Z").toISOString(),
  },
];

// ============================================================================
// Segments
// ============================================================================

export const mockSegments: FileSegment[] = [
  {
    id: TEST_IDS.segments.segment1,
    speakerId: TEST_IDS.speakers.speaker00,
    start: 0.5,
    end: 3.2,
    source: "diarization",
    isDeleted: false,
    isReviewed: false,
    createdAt: new Date("2024-01-01T12:00:00Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:00:00Z").toISOString(),
  },
  {
    id: TEST_IDS.segments.segment2,
    speakerId: TEST_IDS.speakers.speaker01,
    start: 3.5,
    end: 7.8,
    source: "diarization",
    isDeleted: false,
    isReviewed: false,
    createdAt: new Date("2024-01-01T12:00:01Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:00:01Z").toISOString(),
  },
  {
    id: TEST_IDS.segments.segment3,
    speakerId: TEST_IDS.speakers.speaker00,
    start: 8.1,
    end: 12.4,
    source: "diarization",
    isDeleted: false,
    isReviewed: false,
    createdAt: new Date("2024-01-01T12:00:02Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:00:02Z").toISOString(),
  },
  {
    id: TEST_IDS.segments.segment4,
    speakerId: TEST_IDS.speakers.speaker01,
    start: 12.7,
    end: 18.2,
    source: "diarization",
    isDeleted: false,
    isReviewed: false,
    createdAt: new Date("2024-01-01T12:00:03Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:00:03Z").toISOString(),
  },
];

// ============================================================================
// Files
// ============================================================================

/**
 * Default file with speakers and segments
 */
export const defaultFile = {
  id: TEST_IDS.file,
  projectId: TEST_IDS.project,
  name: "Test Recording Session",
  storageKey: "test-user/test-recording.flac",
  waveformStorageKey: "test-user/test-recording.dat",
  fileType: "audio",
  mimeType: "audio/flac",
  sizeBytes: 1024000,
  durationSeconds: 20.5,
  speakers: mockSpeakers,
  segments: mockSegments,
  createdAt: new Date("2024-01-01T12:00:00Z"),
  updatedAt: new Date("2024-01-01T12:00:00Z"),
};

/**
 * Empty file with no speakers or segments
 */
export const emptyFile = {
  ...defaultFile,
  name: "Empty Recording Session",
  speakers: [],
  segments: [],
};

/**
 * File with diarization in progress (no segments yet)
 */
export const diarizingFile = {
  ...defaultFile,
  name: "Diarizing Recording Session",
  speakers: [],
  segments: [],
};

// ============================================================================
// Projects
// ============================================================================

export const defaultProject = {
  id: TEST_IDS.project,
  name: "Test Project",
  description: "A test project for Storybook",
  userId: TEST_IDS.user,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

// ============================================================================
// Helper: Seed Mock DB
// ============================================================================

/**
 * Seed the mock database with a specific file fixture
 * Call this in story beforeEach hooks to set up data
 */
export function seedMockDbForStory(
  db: any,
  fixture: "default" | "empty" | "diarizing",
) {
  const fileData = {
    default: defaultFile,
    empty: emptyFile,
    diarizing: diarizingFile,
  }[fixture];

  // Insert project if not exists
  // (Mock DB is singleton, so we need to handle duplicates)
  // TODO: Implement proper seeding logic based on your DB structure
}

import type { SegmentWithSpeaker } from "~/features/clipping/store/clipping-store";
import type { Speaker } from "~/server/db/schema";

export const MOCK_SPEAKERS: Speaker[] = [
  {
    id: "speaker-1",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_00",
    color: "hsl(0, 70%, 50%)",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "speaker-2",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_01",
    color: "hsl(120, 70%, 50%)",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "speaker-3",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_02",
    color: "hsl(240, 70%, 50%)",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
];

export const MOCK_SEGMENTS: SegmentWithSpeaker[] = [
  {
    id: "seg-1",
    sessionId: "mock-session",
    speakerId: "speaker-1",
    startTime: 0,
    endTime: 5,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[0]!,
  },
  {
    id: "seg-2",
    sessionId: "mock-session",
    speakerId: "speaker-2",
    startTime: 6,
    endTime: 12,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[1]!,
  },
  {
    id: "seg-3",
    sessionId: "mock-session",
    speakerId: "speaker-1",
    startTime: 15,
    endTime: 22,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[0]!,
  },
  {
    id: "seg-4",
    sessionId: "mock-session",
    speakerId: "speaker-3",
    startTime: 25,
    endTime: 35,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[2]!,
  },
  {
    id: "seg-5",
    sessionId: "mock-session",
    speakerId: "speaker-2",
    startTime: 38,
    endTime: 45,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[1]!,
  },
  {
    id: "seg-6",
    sessionId: "mock-session",
    speakerId: "speaker-1",
    startTime: 48,
    endTime: 55,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[0]!,
  },
  {
    id: "seg-7",
    sessionId: "mock-session",
    speakerId: "speaker-3",
    startTime: 58,
    endTime: 65,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    speaker: MOCK_SPEAKERS[2]!,
  },
];

export const DEFAULT_SESSION = {
  sessionId: "mock-session",
  fileId: "mock-file",
  projectId: "mock-project",
  segments: MOCK_SEGMENTS,
  speakers: MOCK_SPEAKERS,
  storageKey: "mock-storage-key",
  playback: { duration: 120 },
} as const;

/**
 * Short audio session (< 15 seconds) - zoom should be disabled.
 * Note: playback.duration must be set for zoom check to work correctly.
 */
export const SHORT_AUDIO_SESSION = {
  sessionId: "mock-session",
  fileId: "mock-file",
  projectId: "mock-project",
  segments: [
    {
      id: "short-seg-1",
      sessionId: "mock-session",
      speakerId: "speaker-1",
      startTime: 0,
      endTime: 5,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      speaker: MOCK_SPEAKERS[0]!,
    },
    {
      id: "short-seg-2",
      sessionId: "mock-session",
      speakerId: "speaker-2",
      startTime: 6,
      endTime: 10,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      speaker: MOCK_SPEAKERS[1]!,
    },
  ],
  speakers: MOCK_SPEAKERS,
  storageKey: "mock-storage-key",
  playback: { duration: 10 }, // Less than 15 seconds - disables zoom
};

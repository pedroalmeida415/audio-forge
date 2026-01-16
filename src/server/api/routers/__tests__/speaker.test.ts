import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { speakerRouter } from "../speaker";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock services module to bypass Effect.js dependency injection
vi.mock("~/services", () => ({
  ServicesLive: {},
  QueueService: {
    enqueueTranscription: vi.fn(),
    enqueueClipProcessing: vi.fn(),
    getProcessingQueueStatus: vi.fn(),
  },
  StorageService: {
    deleteObject: vi.fn(),
    generatePresignedDownloadUrl: vi.fn(),
  },
}));

// Create test UUIDs (valid UUID format)
const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const TEST_PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const TEST_SPEAKER_ID = "44444444-4444-4444-4444-444444444444";
const TEST_SEGMENT_ID = "55555555-5555-5555-5555-555555555555";
const TEST_SESSION_ID = "66666666-6666-6666-6666-666666666666";
const TEST_CLIP_ID = "77777777-7777-7777-7777-777777777777";
const TEST_SEGMENT_ID_2 = "88888888-8888-8888-8888-888888888888";

// Mock data factories
function createMockProject(overrides?: Record<string, unknown>) {
  return {
    id: TEST_PROJECT_ID,
    userId: TEST_USER_ID,
    name: "Test Project",
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockSpeaker(overrides?: Record<string, unknown>) {
  return {
    id: TEST_SPEAKER_ID,
    projectId: TEST_PROJECT_ID,
    userId: TEST_USER_ID,
    name: "Test Speaker",
    color: "#FF0000",
    createdAt: new Date(),
    updatedAt: new Date(),
    project: createMockProject(),
    ...overrides,
  };
}

function createMockSegment(overrides?: Record<string, unknown>) {
  return {
    id: TEST_SEGMENT_ID,
    sessionId: TEST_SESSION_ID,
    speakerId: TEST_SPEAKER_ID,
    startTime: 0,
    endTime: 3.5,
    transcription: "Hello world",
    createdAt: new Date(),
    updatedAt: new Date(),
    clip: null,
    session: {
      file: { storageKey: "files/test-audio.wav" },
    },
    speaker: createMockSpeaker(),
    ...overrides,
  };
}

function createMockClip(overrides?: Record<string, unknown>) {
  return {
    id: TEST_CLIP_ID,
    segmentId: TEST_SEGMENT_ID,
    storageKey: "clips/test-clip.flac",
    duration: 3.5,
    status: "completed" as const,
    errorMessage: null,
    mosScore: 4.2,
    isDenoised: false,
    hasOverlapRemoved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    segment: createMockSegment(),
    ...overrides,
  };
}

// Mock database query builder
function createMockDb() {
  const mockFindFirst = vi.fn();
  const mockFindMany = vi.fn();
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  const mockDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  return {
    query: {
      speakers: { findFirst: mockFindFirst },
      projects: { findFirst: mockFindFirst },
      segments: { findFirst: mockFindFirst, findMany: mockFindMany },
      clips: { findFirst: mockFindFirst },
    },
    update: mockUpdate,
    delete: mockDelete,
    _mocks: { mockFindFirst, mockFindMany, mockUpdate, mockDelete },
  };
}

// Create caller for testing
function createTestCaller(userId: string, db: ReturnType<typeof createMockDb>) {
  const createCaller = createCallerFactory(speakerRouter);

  return createCaller({
    db: db as never,
    session: {
      user: {
        id: userId,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: "session-id",
        userId,
        token: "test-token",
        expiresAt: new Date(Date.now() + 86400000),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    headers: new Headers(),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("speakerRouter", () => {
  describe("getWithSegments", () => {
    it("returns speaker with segments in correct structure", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const mockSpeaker = createMockSpeaker();
      const mockSegments = [
        createMockSegment({ id: TEST_SEGMENT_ID, startTime: 0, endTime: 2.0 }),
        createMockSegment({
          id: TEST_SEGMENT_ID_2,
          startTime: 2.5,
          endTime: 5.0,
        }),
      ];

      // Setup db mock returns
      let findFirstCallCount = 0;
      db._mocks.mockFindFirst.mockImplementation(() => {
        findFirstCallCount++;
        // First call: speaker query, second call: project query
        if (findFirstCallCount === 1) return Promise.resolve(mockSpeaker);
        if (findFirstCallCount === 2)
          return Promise.resolve(createMockProject());
        return Promise.resolve(null);
      });

      db._mocks.mockFindMany.mockResolvedValue(mockSegments);

      const result = await caller.getWithSegments({
        speakerId: TEST_SPEAKER_ID,
      });

      // Verify structure
      expect(result).toHaveProperty("speaker");
      expect(result).toHaveProperty("segments");
      expect(result.speaker.id).toBe(TEST_SPEAKER_ID);
      expect(result.speaker.name).toBe("Test Speaker");
      expect(result.segments).toHaveLength(2);

      // Verify segment structure
      const segment = result.segments[0];
      expect(segment).toHaveProperty("id");
      expect(segment).toHaveProperty("sessionId");
      expect(segment).toHaveProperty("speakerId");
      expect(segment).toHaveProperty("startTime");
      expect(segment).toHaveProperty("endTime");
      expect(segment).toHaveProperty("transcription");
      expect(segment).toHaveProperty("clip");
      expect(segment).toHaveProperty("session");
      expect(segment?.session).toHaveProperty("fileStorageKey");
    });

    it("throws NOT_FOUND when speaker does not exist", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      db._mocks.mockFindFirst.mockResolvedValue(null);

      await expect(
        caller.getWithSegments({ speakerId: TEST_SPEAKER_ID }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getWithSegments({ speakerId: TEST_SPEAKER_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user does not own the speaker", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockSpeaker = createMockSpeaker();
      const mockProject = createMockProject({ userId: TEST_USER_ID }); // Different user owns project

      // Setup mock to alternate returns properly for multiple calls
      db._mocks.mockFindFirst
        .mockResolvedValueOnce(mockSpeaker) // First call: speaker query
        .mockResolvedValueOnce(mockProject); // Second call: project query

      try {
        await caller.getWithSegments({ speakerId: TEST_SPEAKER_ID });
        // Should not reach here
        expect.fail("Expected TRPCError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("updateTranscription", () => {
    it("updates transcription in database", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const mockSegment = createMockSegment({
        speaker: createMockSpeaker({
          project: createMockProject({ userId: TEST_USER_ID }),
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockSegment);

      const result = await caller.updateTranscription({
        segmentId: TEST_SEGMENT_ID,
        transcription: "Updated transcription text",
      });

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when segment does not exist", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      db._mocks.mockFindFirst.mockResolvedValue(null);

      await expect(
        caller.updateTranscription({
          segmentId: TEST_SEGMENT_ID,
          transcription: "New text",
        }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.updateTranscription({
          segmentId: TEST_SEGMENT_ID,
          transcription: "New text",
        });
      } catch (error) {
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user does not own the segment", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockSegment = createMockSegment({
        speaker: createMockSpeaker({
          project: createMockProject({ userId: TEST_USER_ID }), // Different user
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockSegment);

      await expect(
        caller.updateTranscription({
          segmentId: TEST_SEGMENT_ID,
          transcription: "New text",
        }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.updateTranscription({
          segmentId: TEST_SEGMENT_ID,
          transcription: "New text",
        });
      } catch (error) {
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });

    it("allows empty transcription", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const mockSegment = createMockSegment({
        speaker: createMockSpeaker({
          project: createMockProject({ userId: TEST_USER_ID }),
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockSegment);

      const result = await caller.updateTranscription({
        segmentId: TEST_SEGMENT_ID,
        transcription: "",
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("deleteClip", () => {
    it("throws NOT_FOUND when clip does not exist", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      db._mocks.mockFindFirst.mockResolvedValue(null);

      await expect(caller.deleteClip({ clipId: TEST_CLIP_ID })).rejects.toThrow(
        TRPCError,
      );

      try {
        await caller.deleteClip({ clipId: TEST_CLIP_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user does not own the clip", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockClip = createMockClip({
        segment: createMockSegment({
          speaker: createMockSpeaker({
            project: createMockProject({ userId: TEST_USER_ID }), // Different user
          }),
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockClip);

      await expect(caller.deleteClip({ clipId: TEST_CLIP_ID })).rejects.toThrow(
        TRPCError,
      );

      try {
        await caller.deleteClip({ clipId: TEST_CLIP_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("enqueueTranscription", () => {
    it("returns zero count for empty segment array", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const result = await caller.enqueueTranscription({ segmentIds: [] });

      expect(result).toEqual({ queuedCount: 0 });
    });

    it("throws NOT_FOUND when some segments do not exist", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      // Return only 1 segment when 2 are requested
      db._mocks.mockFindMany.mockResolvedValue([createMockSegment()]);

      await expect(
        caller.enqueueTranscription({
          segmentIds: [TEST_SEGMENT_ID, "99999999-9999-9999-9999-999999999999"],
        }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.enqueueTranscription({
          segmentIds: [TEST_SEGMENT_ID, "99999999-9999-9999-9999-999999999999"],
        });
      } catch (error) {
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user does not own some segments", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockSegments = [
        createMockSegment({
          id: TEST_SEGMENT_ID,
          speaker: createMockSpeaker({
            project: createMockProject({ userId: TEST_USER_ID }), // Different user
          }),
        }),
      ];

      db._mocks.mockFindMany.mockResolvedValue(mockSegments);

      await expect(
        caller.enqueueTranscription({ segmentIds: [TEST_SEGMENT_ID] }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.enqueueTranscription({ segmentIds: [TEST_SEGMENT_ID] });
      } catch (error) {
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("enqueueProcessing", () => {
    it("returns zero count for empty segment array", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const result = await caller.enqueueProcessing({
        segmentIds: [],
        operations: ["generate"],
      });

      expect(result).toEqual({ queuedCount: 0 });
    });

    it("returns zero count for empty operations array", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const result = await caller.enqueueProcessing({
        segmentIds: [TEST_SEGMENT_ID],
        operations: [],
      });

      expect(result).toEqual({ queuedCount: 0 });
    });

    it("throws FORBIDDEN when user does not own some segments", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockSegments = [
        createMockSegment({
          id: TEST_SEGMENT_ID,
          speaker: createMockSpeaker({
            project: createMockProject({ userId: TEST_USER_ID }), // Different user
          }),
        }),
      ];

      db._mocks.mockFindMany.mockResolvedValue(mockSegments);

      await expect(
        caller.enqueueProcessing({
          segmentIds: [TEST_SEGMENT_ID],
          operations: ["generate"],
        }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.enqueueProcessing({
          segmentIds: [TEST_SEGMENT_ID],
          operations: ["generate"],
        });
      } catch (error) {
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("getClipPresignedUrl", () => {
    it("throws NOT_FOUND when clip does not exist", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      db._mocks.mockFindFirst.mockResolvedValue(null);

      await expect(
        caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user does not own the clip", async () => {
      const db = createMockDb();
      const caller = createTestCaller(OTHER_USER_ID, db);

      const mockClip = createMockClip({
        segment: createMockSegment({
          speaker: createMockSpeaker({
            project: createMockProject({ userId: TEST_USER_ID }), // Different user
          }),
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockClip);

      await expect(
        caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });

    it("throws BAD_REQUEST when clip has no storage key", async () => {
      const db = createMockDb();
      const caller = createTestCaller(TEST_USER_ID, db);

      const mockClip = createMockClip({
        storageKey: null,
        segment: createMockSegment({
          speaker: createMockSpeaker({
            project: createMockProject({ userId: TEST_USER_ID }),
          }),
        }),
      });

      db._mocks.mockFindFirst.mockResolvedValue(mockClip);

      await expect(
        caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID }),
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getClipPresignedUrl({ clipId: TEST_CLIP_ID });
      } catch (error) {
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
      }
    });
  });
});

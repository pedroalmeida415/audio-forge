import { observable } from "@legendapp/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Clip, Speaker } from "~/server/db/schema";
import { DEFAULT_FILTERS, type SegmentWithClip } from "../speaker-store";

// Mock useObservable to return observable for testing
vi.mock("@legendapp/state/react", () => ({
  useObservable: <T>(initialState: T) => observable(initialState),
}));

// Import after mock is set up
const { createSpeakerPageStore } = await import("../speaker-store");

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSpeaker(overrides?: Partial<Speaker>): Speaker {
  return {
    id: "speaker-1",
    projectId: "project-1",
    name: "Test Speaker",
    color: "#FF0000",
    source: "project",
    localId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockClip(overrides?: Partial<Clip>): Clip {
  return {
    id: "clip-1",
    segmentId: "segment-1",
    storageKey: "clips/clip-1.flac",
    duration: 2.5,
    status: "completed",
    errorMessage: null,
    mosScore: 4.2,
    isDenoised: false,
    hasOverlapRemoved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockSegment(
  overrides?: Partial<SegmentWithClip>,
): SegmentWithClip {
  return {
    id: "segment-1",
    sessionId: "session-1",
    speakerId: "speaker-1",
    startTime: 0,
    endTime: 3.0,
    transcription: null,
    clip: null,
    session: { fileStorageKey: "files/audio.wav" },
    ...overrides,
  };
}

function createTestSegments(): SegmentWithClip[] {
  return [
    createMockSegment({
      id: "seg-1",
      startTime: 0,
      endTime: 2.0, // duration: 2.0s
      transcription: "Hello world",
      clip: createMockClip({ id: "clip-1", segmentId: "seg-1", mosScore: 4.5 }),
    }),
    createMockSegment({
      id: "seg-2",
      startTime: 2.5,
      endTime: 5.5, // duration: 3.0s
      transcription: null,
      clip: createMockClip({ id: "clip-2", segmentId: "seg-2", mosScore: 3.2 }),
    }),
    createMockSegment({
      id: "seg-3",
      startTime: 6.0,
      endTime: 6.5, // duration: 0.5s
      transcription: "Short segment",
      clip: null, // No clip
    }),
    createMockSegment({
      id: "seg-4",
      startTime: 7.0,
      endTime: 12.0, // duration: 5.0s
      transcription: "",
      clip: createMockClip({ id: "clip-4", segmentId: "seg-4", mosScore: 4.8 }),
    }),
    createMockSegment({
      id: "seg-5",
      startTime: 13.0,
      endTime: 15.0, // duration: 2.0s
      transcription: "Another transcription",
      clip: createMockClip({ id: "clip-5", segmentId: "seg-5", mosScore: 2.5 }),
    }),
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe("SpeakerPageStore", () => {
  let $store: ReturnType<typeof createSpeakerPageStore>;
  let testSegments: SegmentWithClip[];

  beforeEach(() => {
    testSegments = createTestSegments();
    $store = createSpeakerPageStore({
      speakerId: "speaker-1",
      projectId: "project-1",
      speaker: createMockSpeaker(),
      segments: testSegments,
    });
  });

  describe("initial state", () => {
    it("initializes with provided data", () => {
      expect($store.speakerId.get()).toBe("speaker-1");
      expect($store.projectId.get()).toBe("project-1");
      expect($store.speaker.get().name).toBe("Test Speaker");
      expect($store.segments.get()).toHaveLength(5);
    });

    it("initializes with default filters", () => {
      const filters = $store.filters.get();
      expect(filters).toEqual(DEFAULT_FILTERS);
    });

    it("initializes with empty selection", () => {
      const selected = $store.selectedSegmentIds.get();
      expect(selected.size).toBe(0);
    });
  });

  describe("filteredSegments computation", () => {
    describe("duration filters", () => {
      it("filters by minimum duration", () => {
        $store.setFilter("durationMin", 2.5);
        const filtered = $store.filteredSegments();

        // Only segments with duration >= 2.5s (seg-2: 3.0s, seg-4: 5.0s)
        expect(filtered).toHaveLength(2);
        expect(filtered.map((s) => s.id)).toEqual(["seg-2", "seg-4"]);
      });

      it("filters by maximum duration", () => {
        $store.setFilter("durationMax", 2.0);
        const filtered = $store.filteredSegments();

        // Segments with duration <= 2.0s (seg-1: 2.0s, seg-3: 0.5s, seg-5: 2.0s)
        expect(filtered).toHaveLength(3);
        expect(filtered.map((s) => s.id)).toEqual(["seg-1", "seg-3", "seg-5"]);
      });

      it("filters by duration range", () => {
        $store.setFilter("durationMin", 1.5);
        $store.setFilter("durationMax", 3.5);
        const filtered = $store.filteredSegments();

        // Segments with 1.5s <= duration <= 3.5s (seg-1: 2.0s, seg-2: 3.0s, seg-5: 2.0s)
        expect(filtered).toHaveLength(3);
        expect(filtered.map((s) => s.id)).toEqual(["seg-1", "seg-2", "seg-5"]);
      });
    });

    describe("MOS score filters", () => {
      it("filters by minimum MOS score", () => {
        $store.setFilter("mosMin", 4.0);
        const filtered = $store.filteredSegments();

        // Segments with MOS >= 4.0 and have clips (seg-1: 4.5, seg-4: 4.8)
        expect(filtered).toHaveLength(2);
        expect(filtered.map((s) => s.id)).toEqual(["seg-1", "seg-4"]);
      });

      it("filters by maximum MOS score", () => {
        $store.setFilter("mosMax", 3.5);
        const filtered = $store.filteredSegments();

        // Segments with MOS <= 3.5 and have clips (seg-2: 3.2, seg-5: 2.5)
        expect(filtered).toHaveLength(2);
        expect(filtered.map((s) => s.id)).toEqual(["seg-2", "seg-5"]);
      });

      it("filters by MOS score range", () => {
        $store.setFilter("mosMin", 3.0);
        $store.setFilter("mosMax", 4.6);
        const filtered = $store.filteredSegments();

        // Segments with 3.0 <= MOS <= 4.6 (seg-1: 4.5, seg-2: 3.2)
        expect(filtered).toHaveLength(2);
        expect(filtered.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
      });

      it("excludes segments without clips when MOS filter is set", () => {
        $store.setFilter("mosMin", 1.0);
        const filtered = $store.filteredSegments();

        // seg-3 has no clip, should be excluded
        expect(filtered.find((s) => s.id === "seg-3")).toBeUndefined();
      });
    });

    describe("transcription status filter", () => {
      it("shows all segments when filter is 'all'", () => {
        $store.setFilter("transcriptionStatus", "all");
        const filtered = $store.filteredSegments();

        expect(filtered).toHaveLength(5);
      });

      it("filters to segments with transcription", () => {
        $store.setFilter("transcriptionStatus", "has");
        const filtered = $store.filteredSegments();

        // Segments with non-null, non-empty transcription (seg-1, seg-3, seg-5)
        expect(filtered).toHaveLength(3);
        expect(filtered.map((s) => s.id)).toEqual(["seg-1", "seg-3", "seg-5"]);
      });

      it("filters to segments missing transcription", () => {
        $store.setFilter("transcriptionStatus", "missing");
        const filtered = $store.filteredSegments();

        // Segments with null transcription (seg-2)
        // Note: seg-4 has empty string "" which is falsy, so it counts as missing
        expect(filtered).toHaveLength(2);
        expect(filtered.map((s) => s.id)).toEqual(["seg-2", "seg-4"]);
      });
    });

    describe("combined filters", () => {
      it("applies all filters together", () => {
        $store.setFilter("durationMin", 1.5);
        $store.setFilter("durationMax", 3.5);
        $store.setFilter("mosMin", 3.0);
        $store.setFilter("transcriptionStatus", "has");
        const filtered = $store.filteredSegments();

        // Duration 1.5-3.5: seg-1, seg-2, seg-5
        // MOS >= 3.0: seg-1, seg-2
        // Has transcription: seg-1
        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.id).toBe("seg-1");
      });
    });
  });

  describe("statistics computation", () => {
    it("calculates total segments", () => {
      const stats = $store.statistics();
      expect(stats.totalSegments).toBe(5);
    });

    it("calculates total duration", () => {
      const stats = $store.statistics();
      // 2.0 + 3.0 + 0.5 + 5.0 + 2.0 = 12.5
      expect(stats.totalDuration).toBe(12.5);
    });

    it("calculates average MOS score", () => {
      const stats = $store.statistics();
      // (4.5 + 3.2 + 4.8 + 2.5) / 4 = 3.75
      expect(stats.averageMos).toBeCloseTo(3.75);
    });

    it("returns null for average MOS when no clips have scores", () => {
      const storeWithNoClips = createSpeakerPageStore({
        speakerId: "speaker-1",
        projectId: "project-1",
        speaker: createMockSpeaker(),
        segments: [
          createMockSegment({ id: "seg-1", clip: null }),
          createMockSegment({ id: "seg-2", clip: null }),
        ],
      });

      const stats = storeWithNoClips.statistics();
      expect(stats.averageMos).toBeNull();
    });

    it("calculates transcription coverage percentage", () => {
      const stats = $store.statistics();
      // 3 segments with non-empty transcription out of 5: 60%
      expect(stats.transcriptionCoverage).toBe(60);
    });

    it("handles empty segments array", () => {
      const emptyStore = createSpeakerPageStore({
        speakerId: "speaker-1",
        projectId: "project-1",
        speaker: createMockSpeaker(),
        segments: [],
      });

      const stats = emptyStore.statistics();
      expect(stats.totalSegments).toBe(0);
      expect(stats.totalDuration).toBe(0);
      expect(stats.averageMos).toBeNull();
      expect(stats.transcriptionCoverage).toBe(0);
    });

    it("returns histogram data structures", () => {
      const stats = $store.statistics();

      expect(stats.durationDistribution).toBeDefined();
      expect(stats.durationDistribution).toHaveProperty("buckets");
      expect(stats.durationDistribution).toHaveProperty("min");
      expect(stats.durationDistribution).toHaveProperty("max");
      expect(stats.durationDistribution).toHaveProperty("bucketSize");

      expect(stats.mosDistribution).toBeDefined();
      expect(stats.mosDistribution).toHaveProperty("buckets");
    });
  });

  describe("selection state management", () => {
    describe("toggleSegmentSelection", () => {
      it("adds segment to selection when not selected", () => {
        $store.toggleSegmentSelection("seg-1");

        const selected = $store.selectedSegmentIds.get();
        expect(selected.has("seg-1")).toBe(true);
        expect(selected.size).toBe(1);
      });

      it("removes segment from selection when already selected", () => {
        $store.toggleSegmentSelection("seg-1");
        $store.toggleSegmentSelection("seg-1");

        const selected = $store.selectedSegmentIds.get();
        expect(selected.has("seg-1")).toBe(false);
        expect(selected.size).toBe(0);
      });

      it("handles multiple selections", () => {
        $store.toggleSegmentSelection("seg-1");
        $store.toggleSegmentSelection("seg-2");
        $store.toggleSegmentSelection("seg-3");

        const selected = $store.selectedSegmentIds.get();
        expect(selected.size).toBe(3);
        expect(selected.has("seg-1")).toBe(true);
        expect(selected.has("seg-2")).toBe(true);
        expect(selected.has("seg-3")).toBe(true);
      });
    });

    describe("selectAll", () => {
      it("selects all filtered segments", () => {
        $store.selectAll();

        const selected = $store.selectedSegmentIds.get();
        expect(selected.size).toBe(5);
        expect(selected.has("seg-1")).toBe(true);
        expect(selected.has("seg-2")).toBe(true);
        expect(selected.has("seg-3")).toBe(true);
        expect(selected.has("seg-4")).toBe(true);
        expect(selected.has("seg-5")).toBe(true);
      });

      it("only selects filtered segments when filters are applied", () => {
        $store.setFilter("transcriptionStatus", "has");
        $store.selectAll();

        const selected = $store.selectedSegmentIds.get();
        // Only segments with transcription: seg-1, seg-3, seg-5
        expect(selected.size).toBe(3);
        expect(selected.has("seg-1")).toBe(true);
        expect(selected.has("seg-2")).toBe(false);
        expect(selected.has("seg-3")).toBe(true);
        expect(selected.has("seg-4")).toBe(false);
        expect(selected.has("seg-5")).toBe(true);
      });

      it("replaces existing selection", () => {
        $store.toggleSegmentSelection("seg-1");
        $store.setFilter("durationMin", 4.0);
        $store.selectAll();

        const selected = $store.selectedSegmentIds.get();
        // Only seg-4 has duration >= 4.0
        expect(selected.size).toBe(1);
        expect(selected.has("seg-1")).toBe(false);
        expect(selected.has("seg-4")).toBe(true);
      });
    });

    describe("clearSelection", () => {
      it("removes all selected segments", () => {
        $store.toggleSegmentSelection("seg-1");
        $store.toggleSegmentSelection("seg-2");
        $store.toggleSegmentSelection("seg-3");

        $store.clearSelection();

        const selected = $store.selectedSegmentIds.get();
        expect(selected.size).toBe(0);
      });

      it("works when selection is already empty", () => {
        $store.clearSelection();

        const selected = $store.selectedSegmentIds.get();
        expect(selected.size).toBe(0);
      });
    });
  });

  describe("setFilter action", () => {
    it("sets durationMin filter", () => {
      $store.setFilter("durationMin", 2.0);
      expect($store.filters.durationMin.get()).toBe(2.0);
    });

    it("sets durationMax filter", () => {
      $store.setFilter("durationMax", 5.0);
      expect($store.filters.durationMax.get()).toBe(5.0);
    });

    it("sets mosMin filter", () => {
      $store.setFilter("mosMin", 3.0);
      expect($store.filters.mosMin.get()).toBe(3.0);
    });

    it("sets mosMax filter", () => {
      $store.setFilter("mosMax", 4.5);
      expect($store.filters.mosMax.get()).toBe(4.5);
    });

    it("sets transcriptionStatus filter", () => {
      $store.setFilter("transcriptionStatus", "has");
      expect($store.filters.transcriptionStatus.get()).toBe("has");
    });

    it("clears filter when set to null", () => {
      $store.setFilter("durationMin", 2.0);
      $store.setFilter("durationMin", null);
      expect($store.filters.durationMin.get()).toBeNull();
    });

    it("preserves other filters when setting one", () => {
      $store.setFilter("durationMin", 2.0);
      $store.setFilter("mosMin", 3.0);
      $store.setFilter("transcriptionStatus", "has");

      expect($store.filters.durationMin.get()).toBe(2.0);
      expect($store.filters.mosMin.get()).toBe(3.0);
      expect($store.filters.transcriptionStatus.get()).toBe("has");
    });
  });

  describe("clearFilters action", () => {
    it("resets all filters to defaults", () => {
      $store.setFilter("durationMin", 2.0);
      $store.setFilter("durationMax", 5.0);
      $store.setFilter("mosMin", 3.0);
      $store.setFilter("mosMax", 4.5);
      $store.setFilter("transcriptionStatus", "has");

      $store.clearFilters();

      const filters = $store.filters.get();
      expect(filters).toEqual(DEFAULT_FILTERS);
    });

    it("restores filtered segments after clearing", () => {
      $store.setFilter("durationMin", 100); // Filter out all segments
      expect($store.filteredSegments()).toHaveLength(0);

      $store.clearFilters();
      expect($store.filteredSegments()).toHaveLength(5);
    });
  });

  describe("updateTranscription action", () => {
    it("updates transcription for existing segment", () => {
      $store.updateTranscription("seg-2", "New transcription text");

      const segment = $store.segments.get().find((s) => s.id === "seg-2");
      expect(segment?.transcription).toBe("New transcription text");
    });

    it("does not throw for non-existent segment", () => {
      expect(() => {
        $store.updateTranscription("non-existent", "Some text");
      }).not.toThrow();
    });

    it("updates statistics after transcription change", () => {
      // Initially: 3 segments with transcription (60%)
      const statsBefore = $store.statistics();
      expect(statsBefore.transcriptionCoverage).toBe(60);

      // Add transcription to seg-2 (null -> text)
      $store.updateTranscription("seg-2", "New transcription");

      // Now: 4 segments with transcription (80%)
      const statsAfter = $store.statistics();
      expect(statsAfter.transcriptionCoverage).toBe(80);
    });

    it("allows clearing transcription to empty string", () => {
      $store.updateTranscription("seg-1", "");

      const segment = $store.segments.get().find((s) => s.id === "seg-1");
      expect(segment?.transcription).toBe("");
    });
  });
});

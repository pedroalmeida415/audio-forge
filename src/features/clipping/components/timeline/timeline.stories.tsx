import type { Meta, StoryContext, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "@storybook/test";
import { HttpResponse, http } from "msw";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import type {
  ClippingStoreInitialData,
  SegmentWithSpeaker,
} from "~/features/clipping/store/clipping-store";
import type { Speaker } from "~/server/db/schema";
import { procedureSpy } from "~/trpc/react";

// ============================================================================
// Inline Mock Data
// ============================================================================

const MOCK_SPEAKERS: Speaker[] = [
  {
    id: "speaker-1",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_00",
    color: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "speaker-2",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_01",
    color: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "speaker-3",
    projectId: "mock-project",
    userId: "mock-user",
    name: "SPEAKER_02",
    color: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
];

const MOCK_SEGMENTS: SegmentWithSpeaker[] = [
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

const DEFAULT_INITIAL_DATA: ClippingStoreInitialData = {
  sessionId: "mock-session",
  fileId: "mock-file",
  projectId: "mock-project",
  segments: MOCK_SEGMENTS,
  speakers: MOCK_SPEAKERS,
  storageKey: "mock-storage-key",
  audioDuration: 120,
};

// ============================================================================
// MSW Handlers (reusable)
// ============================================================================

const mediaProxyHandler = http.get("/api/media-proxy", async () => {
  const response = await fetch("/test-audio.m4a");
  return new HttpResponse(await response.arrayBuffer(), {
    headers: { "Content-Type": "audio/mp4" },
  });
});

// ============================================================================
// Story Args Type
// ============================================================================

/**
 * Story args match ClippingStoreInitialData directly.
 * State overrides are passed via initialData - no need for StoreStateController.
 */
type TimelineStoryArgs = ClippingStoreInitialData;

// ============================================================================
// Meta
// ============================================================================

const meta: Meta<TimelineStoryArgs> = {
  title: "Timeline/TimelineContainer",
  component: TimelineContainer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],

  argTypes: {
    selectedSpeakerId: {
      control: "select",
      options: [null, "speaker-1", "speaker-2", "speaker-3"],
      description: "Currently selected speaker filter",
    },
    activeSegmentId: {
      control: "select",
      options: [
        null,
        "seg-1",
        "seg-2",
        "seg-3",
        "seg-4",
        "seg-5",
        "seg-6",
        "seg-7",
      ],
      description: "Currently active segment",
    },
  },

  args: {
    // Required data
    ...DEFAULT_INITIAL_DATA,
    // Optional state overrides
    selectedSpeakerId: null,
    activeSegmentId: null,
    playback: { currentTime: 0 },
    timeline: { zoomLevel: 100 },
  },
  decorators: [
    (Story, context: StoryContext) => (
      <ClippingStoreProvider initialData={context.args as ClippingStoreInitialData}>
        <div className="h-56 w-full bg-background">
          <Story />
        </div>
      </ClippingStoreProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<TimelineStoryArgs>;

// ============================================================================
// Stories
// ============================================================================

/**
 * Interactive timeline with full controls.
 *
 * Use the Controls panel to:
 * - Adjust playhead position
 * - Change zoom level
 * - Select speaker filter
 * - Set active segment
 */
// tRPC procedure handlers
const getWaveformUrlHandler = http.get("/api/trpc/file.getWaveformUrl", () => {
  return HttpResponse.json({
    result: {
      data: {
        json: { status: "completed", url: "/test-audio.dat", error: null },
      },
    },
  });
});

// Subscription handler - returns empty SSE stream
const diarizationSubscriptionHandler = http.get(
  "/api/trpc/clippingSession.onDiarizationComplete",
  () => {
    // Return an SSE stream that stays open but doesn't emit
    const stream = new ReadableStream({
      start(_controller) {
        // Keep connection open but don't emit anything
      },
    });
    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
);

export const Interactive: Story = {
  parameters: {
    msw: {
      handlers: [
        // Non-tRPC handlers
        mediaProxyHandler,
        // tRPC handlers
        getWaveformUrlHandler,
        diarizationSubscriptionHandler,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Basic verification - timeline renders with progress slider
    await expect(
      canvas.findByRole(
        "slider",
        { name: /audio progress/i },
        { timeout: 5000 },
      ),
    ).resolves.toBeInTheDocument();

    // Assert that the waveform URL procedure was called
    expect(procedureSpy["file.getWaveformUrl"].wasCalled).toBe(true);
    expect(procedureSpy["file.getWaveformUrl"].calls[0]?.input.fileId).toBe(
      "mock-file",
    );

    await waitFor(() => {
      expect(procedureSpy["file.getWaveformUrl"].calls[0]?.output?.url).toBe(
        "/test-audio.dat",
      );
    });
  },
};

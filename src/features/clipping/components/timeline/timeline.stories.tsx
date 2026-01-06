import type { Meta, StoryContext, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "@storybook/test";
import { HttpResponse, http } from "msw";
import { useEffect } from "react";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import {
  ClippingStoreProvider,
  useClippingStore,
} from "~/features/clipping/context/store.context";
import type {
  ClippingStoreInitialData,
  SegmentWithSpeaker,
} from "~/features/clipping/store/clipping-store";
import type { Speaker } from "~/server/db/schema";
import { procedureSpy, TRPCReactProvider } from "~/trpc/react";

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
  session: {
    id: "mock-session",
    fileId: "mock-file",
    projectId: "mock-project",
    segments: MOCK_SEGMENTS,
    speakers: MOCK_SPEAKERS,
  },
  audio: {
    storageKey: "mock-storage-key",
    duration: 120,
  },
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
// Store State Controller
// ============================================================================

interface StoreStateProps {
  currentTime?: number;
  zoomLevel?: number;
  selectedSpeakerId?: string | null;
  activeSegmentId?: string | null;
}

function StoreStateController({
  currentTime,
  zoomLevel,
  selectedSpeakerId,
  activeSegmentId,
}: StoreStateProps) {
  const $store = useClippingStore();

  useEffect(() => {
    if (currentTime !== undefined) {
      $store.playback.currentTime.set(currentTime);
    }
    if (zoomLevel !== undefined) {
      $store.timeline.zoomLevel.set(zoomLevel);
    }
    if (selectedSpeakerId !== undefined) {
      $store.selectedSpeakerId.set(selectedSpeakerId);
    }
    if (activeSegmentId !== undefined) {
      $store.activeSegmentId.set(activeSegmentId);
    }
  }, [$store, currentTime, zoomLevel, selectedSpeakerId, activeSegmentId]);

  return null;
}

// ============================================================================
// Story Args Type
// ============================================================================

interface TimelineStoryArgs {
  initialData: ClippingStoreInitialData;
  currentTime: number;
  zoomLevel: number;
  selectedSpeakerId: string | null;
  activeSegmentId: string | null;
}

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
    currentTime: {
      control: { type: "range", min: 0, max: 120, step: 1 },
      description: "Playhead position in seconds",
    },
    zoomLevel: {
      control: { type: "range", min: 100, max: 500, step: 10 },
      description: "Zoom level percentage (100 = fit to container)",
    },
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
    initialData: DEFAULT_INITIAL_DATA,
    currentTime: 0,
    zoomLevel: 100,
    selectedSpeakerId: null,
    activeSegmentId: null,
  },
  decorators: [
    (Story, context: StoryContext) => (
      <TRPCReactProvider>
        <ClippingStoreProvider
          initialData={context.args.initialData as ClippingStoreInitialData}
        >
          <StoreStateController
            currentTime={context.args.currentTime as number}
            zoomLevel={context.args.zoomLevel as number}
            selectedSpeakerId={context.args.selectedSpeakerId as string | null}
            activeSegmentId={context.args.activeSegmentId as string | null}
          />
          <div className="h-56 w-full bg-background">
            <Story />
          </div>
        </ClippingStoreProvider>
      </TRPCReactProvider>
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
      start(controller) {
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
  beforeEach: () => {
    // Reset spy before component mounts so we capture fresh calls
    procedureSpy.reset();
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

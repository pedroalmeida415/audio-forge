import type { Meta, StoryContext, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import type { ClippingStoreInitialData } from "~/features/clipping/store/clipping-store";
import { procedureSpy } from "~/trpc/react";

import { DEFAULT_SESSION, MOCK_SEGMENTS } from "./fixtures/session";
import { timelineHandlers } from "./handlers";

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
    msw: {
      handlers: timelineHandlers,
    },
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
      options: [null, ...MOCK_SEGMENTS.map((s) => s.id)],
      description: "Currently active segment",
    },
  },

  args: {
    // Required data
    ...DEFAULT_SESSION,
    // Optional state overrides
    selectedSpeakerId: null,
    activeSegmentId: null,
    playback: { currentTime: 0 },
    timeline: { zoomLevel: 100 },
  },
  decorators: [
    (Story, context: StoryContext) => (
      <ClippingStoreProvider
        initialData={context.args as ClippingStoreInitialData}
      >
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
export const Interactive: Story = {
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

/**
 * Timeline with an active segment selected.
 * Shows the active segment actions toolbar (split, change speaker, delete).
 */
export const WithActiveSegment: Story = {
  args: {
    activeSegmentId: "seg-1",
    playback: { currentTime: 2.5 }, // Position playhead inside segment for split action
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify active segment actions are visible
    await expect(
      canvas.findByRole("button", { name: /split segment/i }),
    ).resolves.toBeInTheDocument();

    await expect(
      canvas.findByRole("button", { name: /change speaker/i }),
    ).resolves.toBeInTheDocument();

    await expect(
      canvas.findByRole("button", { name: /delete segment/i }),
    ).resolves.toBeInTheDocument();

    // Speaker badge should be visible (shows segment's speaker)
    await expect(
      canvas.findByTestId("active-segment-speaker"),
    ).resolves.toBeInTheDocument();
  },
};

/**
 * Timeline with an active selection (drag-to-create completed).
 * Shows the inline selection controls with speaker picker and create button.
 */
export const WithActiveSelection: Story = {
  args: {
    selection: {
      mode: "active",
      anchorTime: 70,
      currentTime: 75,
      selectedSpeaker: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify selection controls are visible
    await expect(
      canvas.findByRole("button", { name: /play selection/i }),
    ).resolves.toBeInTheDocument();

    // Create segment button should be visible and disabled without speaker selection
    const createButton = await canvas.findByRole("button", {
      name: /create segment/i,
    });
    expect(createButton).toBeDisabled();

    // Cancel button should be visible
    await expect(
      canvas.findByRole("button", { name: /cancel/i }),
    ).resolves.toBeInTheDocument();

    // Speaker selector should be visible
    await expect(
      canvas.findByRole("button", { name: /select speaker/i }),
    ).resolves.toBeInTheDocument();
  },
};

/**
 * Timeline with a speaker filter active.
 * Non-matching segments should appear dimmed (opacity-25 + grayscale).
 */
export const WithSpeakerFilter: Story = {
  args: {
    selectedSpeakerId: "speaker-1", // Filter to only SPEAKER_00
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Get all segment buttons (they have aria-label starting with "Segment:")
    const segmentButtons = await canvas.findAllByRole("button", {
      name: /^segment:/i,
    });

    // Should have multiple segments rendered
    expect(segmentButtons.length).toBeGreaterThan(0);

    // Find segments from different speakers - some should be dimmed
    const speaker00Segments = segmentButtons.filter((btn) =>
      btn.getAttribute("aria-label")?.includes("SPEAKER_00"),
    );
    const otherSegments = segmentButtons.filter(
      (btn) => !btn.getAttribute("aria-label")?.includes("SPEAKER_00"),
    );

    // Verify we have segments from different speakers
    expect(speaker00Segments.length).toBeGreaterThan(0);
    expect(otherSegments.length).toBeGreaterThan(0);

    // Other segments should be dimmed (have opacity-25 class)
    for (const segment of otherSegments) {
      expect(segment.className).toContain("opacity-25");
    }
  },
};

/**
 * Test zoom controls are rendered.
 * Verifies zoom in/out buttons exist.
 */
export const ZoomControls: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify zoom buttons are rendered
    await expect(
      canvas.findByRole("button", { name: /zoom in/i }),
    ).resolves.toBeInTheDocument();

    await expect(
      canvas.findByRole("button", { name: /zoom out/i }),
    ).resolves.toBeInTheDocument();
  },
};

/**
 * Test clicking a segment to activate it.
 */
export const SegmentClickActivation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for segments to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Find a segment button and click it (aria-label starts with "Segment:")
    const segmentButtons = await canvas.findAllByRole("button", {
      name: /^segment:/i,
    });
    expect(segmentButtons.length).toBeGreaterThan(0);

    const firstSegment = segmentButtons[0];
    if (!firstSegment) throw new Error("No segment buttons found");

    await userEvent.click(firstSegment);

    // After clicking, active segment actions should appear
    await expect(
      canvas.findByRole("button", { name: /split segment/i }),
    ).resolves.toBeInTheDocument();
  },
};

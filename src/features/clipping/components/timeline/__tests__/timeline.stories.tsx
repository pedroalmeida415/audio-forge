import type { Meta, StoryContext, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor } from "@storybook/test";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import type { ClippingStoreInitialData } from "~/features/clipping/store/clipping-store";
import { procedureSpy } from "~/trpc/react";

import { DEFAULT_SESSION } from "./fixtures/session";
import { timelineHandlers } from "./handlers";

// ============================================================================
// Story Args Type
// ============================================================================

interface TimelineStoryArgs {
  initialState: ClippingStoreInitialData;
}

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
  argTypes: {
    initialState: {
      control: "object", // Complex object, controlled via story args
    },
  },

  args: {
    initialState: DEFAULT_SESSION,
  },
  decorators: [
    (Story, context: StoryContext<TimelineStoryArgs>) => (
      <ClippingStoreProvider initialData={context.args.initialState}>
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
  play: async ({ canvas }) => {
    // Basic verification - timeline renders with progress slider
    await expect(
      await canvas.findByRole("slider", { name: /audio progress/i }),
    ).toBeInTheDocument();

    // Assert that the waveform URL procedure was called
    await expect(procedureSpy["file.getWaveformUrl"].wasCalled).toBe(true);
    await expect(
      procedureSpy["file.getWaveformUrl"].calls[0]?.input.sourceId,
    ).toBe("mock-file");

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
    initialState: {
      ...DEFAULT_SESSION,
      activeSegmentId: "seg-1",
      playback: { ...DEFAULT_SESSION.playback, currentTime: 2.5 },
    },
  },
  play: async ({ canvas }) => {
    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify active segment actions are visible (already rendered with initial state)
    await expect(
      canvas.getByRole("button", { name: /split segment/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /change speaker/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /delete segment/i }),
    ).toBeInTheDocument();

    // Speaker badge should be visible (shows segment's speaker)
    await expect(
      canvas.getByTestId("active-segment-speaker"),
    ).toBeInTheDocument();
  },
};

/**
 * Timeline with an active selection (drag-to-create completed).
 * Shows the inline selection controls with speaker picker and create button.
 */
export const WithActiveSelection: Story = {
  args: {
    initialState: {
      ...DEFAULT_SESSION,
      selection: {
        mode: "active",
        anchorTime: 70,
        currentTime: 75,
        selectedSpeaker: null,
      },
    },
  },
  play: async ({ canvas }) => {
    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify selection controls are visible (already rendered with initial state)
    await expect(
      canvas.getByRole("button", { name: /play selection/i }),
    ).toBeInTheDocument();

    // Create segment button should be visible and disabled without speaker selection
    await expect(
      canvas.getByRole("button", { name: /create segment/i }),
    ).toBeDisabled();

    // Cancel button should be visible
    await expect(
      canvas.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();

    // Speaker selector should be visible
    await expect(
      canvas.getByRole("button", { name: /select speaker/i }),
    ).toBeInTheDocument();
  },
};

/**
 * Timeline with a speaker filter active.
 * Non-matching segments should appear dimmed (opacity-25 + grayscale).
 */
export const WithSpeakerFilter: Story = {
  args: {
    initialState: {
      ...DEFAULT_SESSION,
      selectedSpeakerId: "speaker-1",
    },
  },
  play: async ({ canvas }) => {
    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Get all segment buttons (they have aria-label starting with "Segment:")
    const segmentButtons = canvas.getAllByRole("button", {
      name: /^segment:/i,
    });

    // Should have multiple segments rendered
    await expect(segmentButtons.length).toBeGreaterThan(0);

    // Find segments from different speakers - some should be dimmed
    const speaker00Segments = segmentButtons.filter((btn) =>
      btn.getAttribute("aria-label")?.includes("SPEAKER_00"),
    );
    const otherSegments = segmentButtons.filter(
      (btn) => !btn.getAttribute("aria-label")?.includes("SPEAKER_00"),
    );

    // Verify we have segments from different speakers
    await expect(speaker00Segments.length).toBeGreaterThan(0);
    await expect(otherSegments.length).toBeGreaterThan(0);

    // Other segments should be dimmed (have opacity-25 class)
    for (const segment of otherSegments) {
      await expect(segment.className).toContain("opacity-25");
    }
  },
};

/**
 * Test zoom controls are rendered.
 * Verifies zoom in/out buttons exist.
 */
export const ZoomControls: Story = {
  play: async ({ canvas }) => {
    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Verify zoom buttons are rendered (already present after initial render)
    await expect(
      canvas.getByRole("button", { name: /zoom in/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /zoom out/i }),
    ).toBeInTheDocument();
  },
};

/**
 * Test clicking a segment to activate it.
 */
export const SegmentClickActivation: Story = {
  play: async ({ canvas }) => {
    // Wait for timeline to render
    await canvas.findByRole("slider", { name: /audio progress/i });

    // Find a segment button and click it (aria-label starts with "Segment:")
    const segmentButtons = canvas.getAllByRole("button", {
      name: /^segment:/i,
    });
    await expect(segmentButtons.length).toBeGreaterThan(0);

    const firstSegment = segmentButtons[0];
    if (!firstSegment) throw new Error("No segment buttons found");

    await userEvent.click(firstSegment);

    // After clicking, active segment actions should appear
    await expect(
      canvas.getByRole("button", { name: /split segment/i }),
    ).toBeInTheDocument();
  },
};

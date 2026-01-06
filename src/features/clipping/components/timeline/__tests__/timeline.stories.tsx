import type { Meta, StoryContext, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "@storybook/test";
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
  parameters: {
    msw: {
      handlers: timelineHandlers,
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

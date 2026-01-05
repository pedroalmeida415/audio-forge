import type { Meta, StoryObj } from "@storybook/react";
import { TimelineContainer } from "~/features/clipping/components/timeline/timeline-container";
import { ClippingStoreProvider } from "~/features/clipping/context/store.context";
import {
  createInitialData,
  createMockSegment,
  createMockSpeaker,
  type StoreStateOverrides,
} from "~/features/clipping/context/test-utils";
import type { ClippingStoreInitialData } from "~/features/clipping/store/clipping-store";
import type { Speaker } from "~/server/db/schema";
import { TRPCReactProvider } from "~/trpc/react";

// ============================================================================
// Mock Data Sets
// ============================================================================

const speaker1 = createMockSpeaker("speaker-1", "SPEAKER_00");
const speaker2 = createMockSpeaker("speaker-2", "SPEAKER_01");
const speaker3 = createMockSpeaker("speaker-3", "SPEAKER_02");
const speakers: Speaker[] = [speaker1, speaker2, speaker3];

const segments = [
  createMockSegment("seg-1", speaker1, 0, 5),
  createMockSegment("seg-2", speaker2, 6, 12),
  createMockSegment("seg-3", speaker1, 15, 22),
  createMockSegment("seg-4", speaker3, 25, 35),
  createMockSegment("seg-5", speaker2, 38, 45),
  createMockSegment("seg-6", speaker1, 48, 55),
  createMockSegment("seg-7", speaker3, 58, 65),
];

// Long audio with many segments for scrolling tests
const hostSpeaker = createMockSpeaker("long-speaker-1", "Host");
const guestSpeaker = createMockSpeaker("long-speaker-2", "Guest");
const longAudioSpeakers: Speaker[] = [hostSpeaker, guestSpeaker];

const longAudioSegments = Array.from({ length: 30 }, (_, i) => {
  const speaker = i % 2 === 0 ? hostSpeaker : guestSpeaker;
  const startTime = i * 20;
  const duration = 8 + Math.random() * 10;
  return createMockSegment(
    `long-seg-${i}`,
    speaker,
    startTime,
    startTime + duration,
  );
});

// Default initial data
const defaultInitialData = createInitialData({
  segments,
  speakers,
  duration: 120,
});

// ============================================================================
// Custom Parameters Type
// ============================================================================

interface TimelineParameters {
  initialData?: ClippingStoreInitialData;
  stateOverrides?: StoreStateOverrides;
}

// ============================================================================
// Meta
// ============================================================================

const meta: Meta<typeof TimelineContainer> = {
  title: "Timeline/TimelineContainer",
  component: TimelineContainer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  decorators: [
    // Global decorator that reads initialData and stateOverrides from parameters
    (Story, { parameters }) => {
      const { initialData = defaultInitialData, stateOverrides } =
        parameters as TimelineParameters;
      return (
        <TRPCReactProvider>
          <ClippingStoreProvider
            initialData={initialData}
            stateOverrides={stateOverrides}
          >
            <div className="h-56 w-full bg-background">
              <Story />
            </div>
          </ClippingStoreProvider>
        </TRPCReactProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof TimelineContainer>;

// ============================================================================
// Stories
// ============================================================================

/**
 * Default state with segments loaded and ready for interaction.
 * Shows the full timeline with multiple speakers and segments.
 */
export const Default: Story = {};

/**
 * Empty timeline with no segments.
 * Useful for testing the timeline appearance before diarization.
 */
export const Empty: Story = {
  parameters: {
    initialData: createInitialData({
      segments: [],
      speakers: [],
      duration: 180,
    }),
  },
};

/**
 * Loading state while audio is being prepared.
 * Note: With real store, loading state is controlled by usePlayback hook.
 * This shows the timeline with zero duration (before audio loads).
 */
export const Loading: Story = {
  parameters: {
    initialData: createInitialData({
      segments: [],
      speakers: [],
      duration: 0,
    }),
  },
};

/**
 * Playing state with playhead at mid-point.
 * The play button should show pause icon.
 */
export const Playing: Story = {
  parameters: {
    stateOverrides: { currentTime: 45, isPlaying: true },
  },
};

/**
 * With an active segment selected.
 * Shows the segment highlight and enables segment actions.
 */
export const WithActiveSegment: Story = {
  parameters: {
    stateOverrides: {
      currentTime: 18,
      activeSegmentId: "seg-3",
      selectedSpeakerId: "speaker-1",
    },
  },
};

/**
 * With speaker filter applied.
 * Non-matching segments should appear dimmed.
 */
export const WithSpeakerFilter: Story = {
  parameters: {
    stateOverrides: { selectedSpeakerId: "speaker-1" },
  },
};

/**
 * Zoomed in view (150% zoom).
 * Shows more detail with larger waveform and segment display.
 */
export const ZoomedIn: Story = {
  parameters: {
    stateOverrides: { zoomLevel: 150, scrollOffset: 100, currentTime: 30 },
  },
};

/**
 * Zoomed out view (50% zoom).
 * Shows the full timeline in a compressed view.
 */
export const ZoomedOut: Story = {
  parameters: {
    stateOverrides: { zoomLevel: 50 },
  },
};

/**
 * Long audio (10 minutes) with many segments.
 * Tests scrolling and virtualization performance.
 */
export const LongAudio: Story = {
  parameters: {
    initialData: createInitialData({
      segments: longAudioSegments,
      speakers: longAudioSpeakers,
      duration: 600,
    }),
  },
};

/**
 * Long audio scrolled to middle.
 * Tests the scrollbar and segment display when scrolled.
 */
export const LongAudioScrolled: Story = {
  parameters: {
    initialData: createInitialData({
      segments: longAudioSegments,
      speakers: longAudioSpeakers,
      duration: 600,
    }),
    stateOverrides: { scrollOffset: 400, currentTime: 300 },
  },
};

/**
 * Short audio (under 15 seconds).
 * Zoom should be disabled for short audio.
 */
export const ShortAudio: Story = {
  parameters: {
    initialData: createInitialData({
      segments: [
        createMockSegment("short-seg-1", speaker1, 0, 4),
        createMockSegment("short-seg-2", speaker2, 5, 10),
      ],
      speakers,
      duration: 12,
    }),
  },
};

/**
 * Playhead at specific time.
 * Shows the playhead indicator at a non-zero position.
 */
export const PlayheadAtTime: Story = {
  parameters: {
    stateOverrides: { currentTime: 42.5 },
  },
};

/**
 * Single speaker scenario.
 * Common for solo recordings or monologues.
 */
export const SingleSpeaker: Story = {
  parameters: {
    initialData: (() => {
      const soloSpeaker = createMockSpeaker("solo-speaker", "Narrator");
      return createInitialData({
        segments: [
          createMockSegment("solo-1", soloSpeaker, 0, 15),
          createMockSegment("solo-2", soloSpeaker, 18, 35),
          createMockSegment("solo-3", soloSpeaker, 40, 60),
        ],
        speakers: [soloSpeaker],
        duration: 90,
      });
    })(),
  },
};

/**
 * Many speakers (6 speakers).
 * Tests color differentiation with multiple speakers.
 */
export const ManySpeakers: Story = {
  parameters: {
    initialData: (() => {
      const manySpeakers = Array.from({ length: 6 }, (_, i) =>
        createMockSpeaker(`multi-speaker-${i}`, `Speaker ${i + 1}`),
      );
      const manySegments = manySpeakers.flatMap((speaker, i) => [
        createMockSegment(`multi-seg-${i}-1`, speaker, i * 15, i * 15 + 8),
        createMockSegment(
          `multi-seg-${i}-2`,
          speaker,
          90 + i * 10,
          90 + i * 10 + 6,
        ),
      ]);
      return createInitialData({
        segments: manySegments,
        speakers: manySpeakers,
        duration: 180,
      });
    })(),
  },
};

/**
 * Dense segments (close together).
 * Tests segment rendering when segments are tightly packed.
 */
export const DenseSegments: Story = {
  parameters: {
    initialData: (() => {
      const speakerOptions = [speaker1, speaker2, speaker3];
      const denseSegments = Array.from({ length: 20 }, (_, i) => {
        const speaker = speakerOptions[i % 3] as Speaker;
        return createMockSegment(`dense-seg-${i}`, speaker, i * 3, i * 3 + 2.5);
      });
      return createInitialData({
        segments: denseSegments,
        speakers,
        duration: 70,
      });
    })(),
  },
};

/**
 * Multiple segments selected.
 * Shows the multi-selection highlight state.
 */
export const MultipleSegmentsSelected: Story = {
  parameters: {
    stateOverrides: {
      selectedSpeakerId: "speaker-1",
      activeSegmentId: "seg-1",
    },
  },
};

/**
 * Near end of audio.
 * Tests playhead behavior near the end of the timeline.
 */
export const NearEnd: Story = {
  parameters: {
    stateOverrides: { currentTime: 115 },
  },
};

/**
 * Very long segment.
 * Tests rendering of a single segment that spans most of the timeline.
 */
export const VeryLongSegment: Story = {
  parameters: {
    initialData: createInitialData({
      segments: [createMockSegment("long-seg", speaker1, 5, 110)],
      speakers: [speaker1],
      duration: 120,
    }),
  },
};

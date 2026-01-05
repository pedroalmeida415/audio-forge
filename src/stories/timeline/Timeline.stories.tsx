import type { Meta, StoryObj } from "@storybook/react";
import { TimelineContainer } from "~/app/(app)/app/project/[projectId]/clipping/[sessionId]/_components/timeline/timeline-container";
import type {
  ClippingStoreInitialData,
  SegmentWithSpeaker,
} from "~/app/(app)/app/project/[projectId]/clipping/[sessionId]/_store/clipping-store";
import type { Speaker } from "~/server/db/schema";
import {
  createInitialData,
  createMockSegment,
  createMockSpeaker,
  MockStoreProvider,
  type StoreStateOverrides,
} from "./store.context";

// ============================================================================
// Mock Data Sets
// ============================================================================

const speaker1 = createMockSpeaker("speaker-1", "SPEAKER_00");
const speaker2 = createMockSpeaker("speaker-2", "SPEAKER_01");
const speaker3 = createMockSpeaker("speaker-3", "SPEAKER_02");
const speakers: Speaker[] = [speaker1, speaker2, speaker3];

const segments: SegmentWithSpeaker[] = [
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

const longAudioSegments: SegmentWithSpeaker[] = Array.from(
  { length: 30 },
  (_, i) => {
    const speaker = i % 2 === 0 ? hostSpeaker : guestSpeaker;
    const startTime = i * 20;
    const duration = 8 + Math.random() * 10;
    return createMockSegment(
      `long-seg-${i}`,
      speaker,
      startTime,
      startTime + duration,
    );
  },
);

// ============================================================================
// Story Decorator
// ============================================================================

function TimelineDecorator({
  initialData,
  stateOverrides,
  children,
}: {
  initialData: ClippingStoreInitialData;
  stateOverrides?: StoreStateOverrides;
  children: React.ReactNode;
}) {
  return (
    <MockStoreProvider
      initialData={initialData}
      stateOverrides={stateOverrides}
    >
      <div className="h-56 w-full bg-background">{children}</div>
    </MockStoreProvider>
  );
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
export const Default: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Empty timeline with no segments.
 * Useful for testing the timeline appearance before diarization.
 */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({
          segments: [],
          speakers: [],
          duration: 180,
        })}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Loading state while audio is being prepared.
 * Note: With real store, loading state is controlled by usePlayback hook.
 * This shows the timeline with zero duration (before audio loads).
 */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({
          segments: [],
          speakers: [],
          duration: 0,
        })}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Playing state with playhead at mid-point.
 * The play button should show pause icon.
 */
export const Playing: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ currentTime: 45, isPlaying: true }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * With an active segment selected.
 * Shows the segment highlight and enables segment actions.
 */
export const WithActiveSegment: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{
          currentTime: 18,
          activeSegmentId: "seg-3",
          selectedSpeakerId: "speaker-1",
        }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * With speaker filter applied.
 * Non-matching segments should appear dimmed.
 */
export const WithSpeakerFilter: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ selectedSpeakerId: "speaker-1" }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Zoomed in view (150% zoom).
 * Shows more detail with larger waveform and segment display.
 */
export const ZoomedIn: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ zoomLevel: 150, scrollOffset: 100, currentTime: 30 }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Zoomed out view (50% zoom).
 * Shows the full timeline in a compressed view.
 */
export const ZoomedOut: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ zoomLevel: 50 }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Long audio (10 minutes) with many segments.
 * Tests scrolling and virtualization performance.
 */
export const LongAudio: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({
          segments: longAudioSegments,
          speakers: longAudioSpeakers,
          duration: 600,
        })}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Long audio scrolled to middle.
 * Tests the scrollbar and segment display when scrolled.
 */
export const LongAudioScrolled: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({
          segments: longAudioSegments,
          speakers: longAudioSpeakers,
          duration: 600,
        })}
        stateOverrides={{ scrollOffset: 400, currentTime: 300 }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Short audio (under 15 seconds).
 * Zoom should be disabled for short audio.
 */
export const ShortAudio: Story = {
  decorators: [
    (Story) => {
      const shortSegments = [
        createMockSegment("short-seg-1", speaker1, 0, 4),
        createMockSegment("short-seg-2", speaker2, 5, 10),
      ];
      return (
        <TimelineDecorator
          initialData={createInitialData({
            segments: shortSegments,
            speakers,
            duration: 12,
          })}
        >
          <Story />
        </TimelineDecorator>
      );
    },
  ],
};

/**
 * Playhead at specific time.
 * Shows the playhead indicator at a non-zero position.
 */
export const PlayheadAtTime: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ currentTime: 42.5 }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Single speaker scenario.
 * Common for solo recordings or monologues.
 */
export const SingleSpeaker: Story = {
  decorators: [
    (Story) => {
      const soloSpeaker = createMockSpeaker("solo-speaker", "Narrator");
      const soloSegments = [
        createMockSegment("solo-1", soloSpeaker, 0, 15),
        createMockSegment("solo-2", soloSpeaker, 18, 35),
        createMockSegment("solo-3", soloSpeaker, 40, 60),
      ];
      return (
        <TimelineDecorator
          initialData={createInitialData({
            segments: soloSegments,
            speakers: [soloSpeaker],
            duration: 90,
          })}
        >
          <Story />
        </TimelineDecorator>
      );
    },
  ],
};

/**
 * Many speakers (6 speakers).
 * Tests color differentiation with multiple speakers.
 */
export const ManySpeakers: Story = {
  decorators: [
    (Story) => {
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
      return (
        <TimelineDecorator
          initialData={createInitialData({
            segments: manySegments,
            speakers: manySpeakers,
            duration: 180,
          })}
        >
          <Story />
        </TimelineDecorator>
      );
    },
  ],
};

/**
 * Dense segments (close together).
 * Tests segment rendering when segments are tightly packed.
 */
export const DenseSegments: Story = {
  decorators: [
    (Story) => {
      const speakerOptions = [speaker1, speaker2, speaker3];
      const denseSegments = Array.from({ length: 20 }, (_, i) => {
        const speaker = speakerOptions[i % 3] as Speaker;
        return createMockSegment(`dense-seg-${i}`, speaker, i * 3, i * 3 + 2.5);
      });
      return (
        <TimelineDecorator
          initialData={createInitialData({
            segments: denseSegments,
            speakers,
            duration: 70,
          })}
        >
          <Story />
        </TimelineDecorator>
      );
    },
  ],
};

/**
 * Multiple segments selected.
 * Shows the multi-selection highlight state.
 */
export const MultipleSegmentsSelected: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{
          selectedSpeakerId: "speaker-1",
          activeSegmentId: "seg-1",
        }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Near end of audio.
 * Tests playhead behavior near the end of the timeline.
 */
export const NearEnd: Story = {
  decorators: [
    (Story) => (
      <TimelineDecorator
        initialData={createInitialData({ segments, speakers, duration: 120 })}
        stateOverrides={{ currentTime: 115 }}
      >
        <Story />
      </TimelineDecorator>
    ),
  ],
};

/**
 * Very long segment.
 * Tests rendering of a single segment that spans most of the timeline.
 */
export const VeryLongSegment: Story = {
  decorators: [
    (Story) => {
      const longSegment = createMockSegment("long-seg", speaker1, 5, 110);
      return (
        <TimelineDecorator
          initialData={createInitialData({
            segments: [longSegment],
            speakers: [speaker1],
            duration: 120,
          })}
        >
          <Story />
        </TimelineDecorator>
      );
    },
  ],
};

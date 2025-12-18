"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/shallow";
import { api } from "~/trpc/react";
import { usePlayback } from "../../_context/playback.context";
import { useClippingStore } from "../../_context/store.context";
import { useTimelineResize } from "../../_hooks/use-timeline-resize";
import { TIMELINE_CONSTANTS } from "../../_store/clipping-workspace-store";
import { TimelineProgressBar } from "./timeline-progress-bar";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

const { BASE_TIMESPAN } = TIMELINE_CONSTANTS;

/**
 * Get speaker color index from speaker order.
 */
function getSpeakerColorIndex(
  segments: { speaker: string }[],
  speaker: string,
): number {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const seg of segments) {
    if (!seen.has(seg.speaker)) {
      seen.add(seg.speaker);
      order.push(seg.speaker);
    }
  }
  const index = order.indexOf(speaker);
  return index >= 0 ? index : 0;
}

export function TimelineContainer() {
  const {
    handleTimelineSegmentClick,
    handleScrubberDrag,
    handleTimelineClick,
    scrollContainerRef,
  } = usePlayback();
  const {
    duration,
    zoomLevel,
    containerWidth,
    segmentsById,
    activeSegmentId,
    selectedSpeaker,
    speakerCollections,
    diarizationId,
    updateSegmentTimes,
  } = useClippingStore(
    useShallow((s) => ({
      duration: s.playback.duration,
      zoomLevel: s.timeline.zoomLevel,
      containerWidth: s.timeline.containerWidth,
      segmentsById: s.segments.segmentsById,
      activeSegmentId: s.segments.activeSegmentId,
      selectedSpeaker: s.segments.selectedSpeaker,
      speakerCollections: s.segments.speakerCollections,
      diarizationId: s.segments.diarizationId,
      updateSegmentTimes: s.segments.updateSegmentTimes,
    })),
  );

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

  // Called during drag for immediate visual feedback (local store update only)
  const handleDragUpdate = useCallback(
    (segmentId: string, start: number, end: number) => {
      updateSegmentTimes(segmentId, start, end);
    },
    [updateSegmentTimes],
  );

  // Called on drag end to persist changes (triggers mutation)
  const handleCommitUpdate = useCallback(
    (segmentId: string, field: "start" | "end", newTime: number) => {
      updateSegmentsMutation.mutate({
        diarizationId,
        segmentIds: segmentId,
        updates: { [field]: newTime },
      });
    },
    [diarizationId, updateSegmentsMutation],
  );

  const containerRef = useTimelineResize();

  const segments = Object.values(segmentsById);

  // Derived values
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  const pixelsPerSecond =
    visibleTimespan > 0 ? containerWidth / visibleTimespan : 0;
  const totalWidth = Math.max(duration * pixelsPerSecond, containerWidth);

  // Generate timestamp marks
  const timestampMarks: { time: number; major: boolean }[] = [];

  let majorInterval: number;
  let minorInterval: number;

  if (zoomLevel >= 200) {
    majorInterval = 2;
    minorInterval = 0.5;
  } else if (zoomLevel >= 100) {
    majorInterval = 5;
    minorInterval = 1;
  } else if (zoomLevel >= 50) {
    majorInterval = 10;
    minorInterval = 2;
  } else {
    majorInterval = 30;
    minorInterval = 5;
  }

  const maxTime = Math.max(duration, visibleTimespan);

  for (let t = 0; t <= maxTime; t += minorInterval) {
    timestampMarks.push({
      time: t,
      major: t % majorInterval === 0,
    });
  }

  const timeToPixels = (time: number) => time * pixelsPerSecond;
  const pixelsToTime = (pixels: number) =>
    pixelsPerSecond > 0 ? pixels / pixelsPerSecond : 0;

  return (
    <div
      className="flex h-56 shrink-0 flex-col border-t bg-muted/20"
      ref={containerRef}
    >
      {/* Progress bar */}
      <TimelineProgressBar />

      {/* Toolbar */}
      <TimelineToolbar />

      {/* Scrollable timeline content */}
      <div
        className="relative flex-1 cursor-crosshair overflow-x-auto overflow-y-hidden"
        onClick={handleTimelineClick}
        onKeyDown={() => {}}
        ref={scrollContainerRef}
        role="region"
      >
        <div className="relative h-full" style={{ width: totalWidth }}>
          {/* Scrubber - positioned absolutely across the whole timeline */}
          <TimelineScrubber onDrag={handleScrubberDrag} />

          {/* Stacked timeline elements */}
          <div className="flex h-full flex-col">
            {/* Timestamps */}
            <TimelineTimestamps
              marks={timestampMarks}
              timeToPixels={timeToPixels}
            />

            {/* Segments bar */}
            <TimelineSegmentsBar
              getSpeakerColorIndex={(speaker) =>
                getSpeakerColorIndex(segments, speaker)
              }
              onSegmentClick={handleTimelineSegmentClick}
              onDragUpdate={handleDragUpdate}
              onCommitUpdate={handleCommitUpdate}
              pixelsToTime={pixelsToTime}
              segments={segments}
              activeSegmentId={activeSegmentId}
              selectedSpeaker={selectedSpeaker}
              speakerCollections={speakerCollections}
              timeToPixels={timeToPixels}
            />

            {/* Waveform */}
            <TimelineWaveform />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useClippingWorkspace } from "../../_context/clipping-workspace-context";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

export function TimelineContainer() {
  const {
    audioPlayer,
    audioDataBuffer,
    timeline,
    workspace,
    handleTimelineSegmentClick,
    handleScrubberDrag,
    handleTimelineClick,
    timelineContainerRef,
  } = useClippingWorkspace();

  return (
    <div
      className="flex h-56 shrink-0 flex-col border-t bg-muted/20"
      ref={timelineContainerRef}
    >
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Scrollable timeline content */}
      <div
        className="relative flex-1 cursor-crosshair overflow-x-auto overflow-y-hidden"
        onClick={handleTimelineClick}
        ref={timeline.scrollContainerRef}
      >
        <div className="relative h-full" style={{ width: timeline.totalWidth }}>
          {/* Scrubber - positioned absolutely across the whole timeline */}
          <TimelineScrubber
            currentTime={audioPlayer.currentTime}
            onDrag={handleScrubberDrag}
            timeToPixels={timeline.timeToPixels}
          />

          {/* Stacked timeline elements */}
          <div className="flex h-full flex-col">
            {/* Timestamps */}
            <TimelineTimestamps
              marks={timeline.timestampMarks}
              timeToPixels={timeline.timeToPixels}
            />

            {/* Segments bar */}
            <TimelineSegmentsBar
              getSpeakerColorIndex={workspace.getSpeakerColorIndex}
              onSegmentClick={handleTimelineSegmentClick}
              segments={workspace.segments}
              selectedSegmentId={workspace.selectedSegmentId}
              timeToPixels={timeline.timeToPixels}
            />

            {/* Waveform */}
            <TimelineWaveform
              audioDataBuffer={audioDataBuffer}
              duration={audioPlayer.duration}
              pixelsPerSecond={timeline.pixelsPerSecond}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

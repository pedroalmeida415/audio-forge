"use client";

import { useQueryState } from "nuqs";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";
import { usePlayback } from "~/features/workspace/hooks/use-playback";
import { useSelectionDrag } from "~/features/workspace/hooks/use-selection-drag";
import { useSpacebarPlayback } from "~/features/workspace/hooks/use-spacebar-playback";
import { useTimelineResize } from "~/features/workspace/hooks/use-timeline-resize";
import { useWheelZoom } from "~/features/workspace/hooks/use-wheel-zoom";
import { workspaceParams } from "~/features/workspace/search-params";
import type { Segment, Speaker } from "~/server/db/schema";
import { HoverPlayhead } from "./hover-playhead";
import { SegmentResizeHandles } from "./segment-resize-handles";
import { SelectionOverlay } from "./selection-overlay";
import { SelectionResizeHandles } from "./selection-resize-handles";
import { TimelineProgressBar } from "./timeline-progress-bar";
import { TimelineScrollbar } from "./timeline-scrollbar";
import { TimelineScrubber } from "./timeline-scrubber";
import { TimelineSegmentsBar } from "./timeline-segments-bar";
import { TimelineTimestamps } from "./timeline-timestamps";
import { TimelineToolbar } from "./timeline-toolbar";
import { TimelineWaveform } from "./timeline-waveform";

interface TimelineContainerProps {
  segments: Segment[];
  speakers: Speaker[];
  sourceId: string;
  projectId: string;
  speakerId: string | null;
  sourceData: { storageKey: string; duration: number };
  onStartDiarization: () => void;
  isDiarizationRunning: boolean;
  isDiarizationCompleted: boolean;
  isDiarizationButtonDisabled: boolean;
  denoiseBeforeDiarization: boolean;
  onDenoiseBeforeDiarizationChange: (value: boolean) => void;
}

/**
 * Timeline container composing all timeline sub-components.
 *
 * Uses manual scroll handling with transform-based positioning.
 * Native scroll is disabled - scrollOffset in store controls virtual scroll position.
 *
 * Supports click-and-drag segment creation via the selection system.
 */
export function TimelineContainer({
  segments,
  speakers,
  sourceId,
  projectId,
  speakerId,
  sourceData,
  onStartDiarization,
  isDiarizationRunning,
  isDiarizationCompleted,
  isDiarizationButtonDisabled,
  denoiseBeforeDiarization,
  onDenoiseBeforeDiarizationChange,
}: TimelineContainerProps) {
  const { store } = useWorkspaceStore();
  const [activeSegmentId, setActiveSegmentId] = useQueryState(
    "activeSegmentId",
    workspaceParams.activeSegmentId,
  );

  const containerRef = useTimelineResize();

  // Connect MSE audio provider to store
  usePlayback(sourceData, segments, activeSegmentId);

  // Enable spacebar playback toggling
  useSpacebarPlayback(!!sourceData);

  // Enable Ctrl+wheel zooming and Shift+wheel scrolling
  useWheelZoom(store);

  // Enable click-and-drag selection for segment creation
  const { handleMouseDown, handleMouseMove, handleMouseLeave } =
    useSelectionDrag(store);

  return (
    <div
      className="flex h-56 shrink-0 flex-col border-t bg-muted/20"
      ref={containerRef}
    >
      {/* Progress bar */}
      <TimelineProgressBar />

      {/* Toolbar */}
      <TimelineToolbar
        segments={segments}
        speakers={speakers}
        sourceId={sourceId}
        projectId={projectId}
        speakerId={speakerId}
        activeSegmentId={activeSegmentId}
        onActiveSegmentChange={(id) => void setActiveSegmentId(id)}
        onStartDiarization={onStartDiarization}
        isDiarizationRunning={isDiarizationRunning}
        isDiarizationCompleted={isDiarizationCompleted}
        isDiarizationButtonDisabled={isDiarizationButtonDisabled}
        denoiseBeforeDiarization={denoiseBeforeDiarization}
        onDenoiseBeforeDiarizationChange={onDenoiseBeforeDiarizationChange}
      />

      {/* Timeline content - no native scroll, manual handling via transforms */}
      <div
        className="relative flex-1 cursor-crosshair overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        ref={(el) => {
          store.refs.scrollContainer = el;
        }}
        role="region"
      >
        {/* Scrubber (playhead) */}
        <TimelineScrubber />

        {/* Hover playhead - shows time at mouse position */}
        <HoverPlayhead />

        {/* Selection overlay - shows drag selection area */}
        <SelectionOverlay />

        {/* Stacked timeline elements */}
        <div className="flex h-full flex-col">
          {/* Timestamps */}
          <TimelineTimestamps />

          {/* Segments bar */}
          <TimelineSegmentsBar
            segments={segments}
            speakers={speakers}
            speakerId={speakerId}
            activeSegmentId={activeSegmentId}
          />

          {/* Waveform */}
          <TimelineWaveform sourceId={sourceId} />
        </div>

        {/* Custom scrollbar */}
        <TimelineScrollbar />
      </div>

      {/* Segment resize handles */}
      <SegmentResizeHandles
        segments={segments}
        sourceId={sourceId}
        activeSegmentId={activeSegmentId}
      />

      {/* Selection resize handles */}
      <SelectionResizeHandles />
    </div>
  );
}

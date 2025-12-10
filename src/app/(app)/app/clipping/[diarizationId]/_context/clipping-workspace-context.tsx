"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RouterOutputs } from "~/trpc/react";
import { type AudioPlayer, useAudioPlayer } from "../_hooks/use-audio-player";
import { type Timeline, useTimeline } from "../_hooks/use-timeline";
import {
  useWorkspaceState,
  type WorkspaceState,
} from "../_hooks/use-workspace-state";

interface ClippingWorkspaceContextValue {
  // Data
  fileName: string;
  audioUrl: string;

  // Hooks
  audioPlayer: AudioPlayer;
  timeline: Timeline;
  workspace: WorkspaceState;

  // Actions
  handleSegmentSelect: (segmentId: string) => void;
  handleTimelineSegmentClick: (segmentId: string) => void;
  handleSegmentPlay: (segmentId: string) => void;
  handleNavigateSegment: (direction: "next" | "prev") => void;
  handleScrubberDrag: (clientX: number, rect: DOMRect) => void;
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;

  // Refs
  timelineContainerRef: React.RefObject<HTMLDivElement | null>;
}

const ClippingWorkspaceContext =
  createContext<ClippingWorkspaceContextValue | null>(null);

interface ClippingWorkspaceProviderProps {
  children: ReactNode;
  initialData: {
    diarization: RouterOutputs["diarization"]["getById"];
    audioUrl: string;
  };
}

export function ClippingWorkspaceProvider({
  children,
  initialData,
}: ClippingWorkspaceProviderProps) {
  const { diarization, audioUrl } = initialData;

  // Timeline container ref for measuring width
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const [timelineWidth, setTimelineWidth] = useState(800);

  const segments = diarization.output?.segments ?? [];
  const fileName =
    diarization.file?.storageKey?.split("/").pop() ?? "Audio File";

  // Measure timeline container width
  useEffect(() => {
    const updateWidth = () => {
      if (timelineContainerRef.current) {
        setTimelineWidth(timelineContainerRef.current.offsetWidth);
      }
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (timelineContainerRef.current) {
      observer.observe(timelineContainerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Audio player
  const audioPlayer = useAudioPlayer({
    url: audioUrl,
  });

  // Workspace state (speakers, segments, selection)
  const workspace = useWorkspaceState({
    segments,
    totalDuration: audioPlayer.duration,
  });

  // Timeline state
  const timeline = useTimeline({
    duration: audioPlayer.duration,
    containerWidth: timelineWidth,
  });

  // Handle segment selection from grid - focus timeline
  const handleSegmentSelect = useCallback(
    (segmentId: string) => {
      workspace.selectSegment(segmentId);
      const segment = workspace.getSegmentById(segmentId);
      if (segment) {
        timeline.scrollToTime(segment.start);
      }
    },
    [workspace, timeline],
  );

  // Handle segment click from timeline - reveal in grid
  const handleTimelineSegmentClick = useCallback(
    (segmentId: string) => {
      workspace.selectSegment(segmentId);
    },
    [workspace],
  );

  // Handle segment play from grid
  const handleSegmentPlay = useCallback(
    (segmentId: string) => {
      const segment = workspace.getSegmentById(segmentId);
      if (segment) {
        audioPlayer.playSegment(segment.start, segment.end);
        timeline.scrollToTime(segment.start);
      }
    },
    [workspace, audioPlayer, timeline],
  );

  // Navigate to next/prev segment
  const handleNavigateSegment = useCallback(
    (direction: "next" | "prev") => {
      const segment = workspace.getAdjacentSegment(direction);
      if (segment) {
        workspace.selectSegment(segment.id);
        timeline.scrollToTime(segment.start);
      }
    },
    [workspace, timeline],
  );

  // Handle scrubber drag
  const handleScrubberDrag = useCallback(
    (clientX: number, rect: DOMRect) => {
      const container = timeline.scrollContainerRef.current;
      if (!container) return;

      const scrollLeft = container.scrollLeft;
      const relativeX = clientX - rect.left + scrollLeft;
      const time = timeline.pixelsToTime(relativeX);
      const clampedTime = Math.max(0, Math.min(time, audioPlayer.duration));
      audioPlayer.seek(clampedTime);
    },
    [timeline, audioPlayer],
  );

  // Handle timeline click to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;

      const container = timeline.scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const relativeX = e.clientX - rect.left + scrollLeft;
      const time = timeline.pixelsToTime(relativeX);
      const clampedTime = Math.max(0, Math.min(time, audioPlayer.duration));
      audioPlayer.seek(clampedTime);
    },
    [timeline, audioPlayer],
  );

  const value = useMemo<ClippingWorkspaceContextValue>(
    () => ({
      fileName,
      audioUrl,
      audioPlayer,
      timeline,
      workspace,
      handleSegmentSelect,
      handleTimelineSegmentClick,
      handleSegmentPlay,
      handleNavigateSegment,
      handleScrubberDrag,
      handleTimelineClick,
      timelineContainerRef,
    }),
    [
      fileName,
      audioUrl,
      audioPlayer,
      timeline,
      workspace,
      handleSegmentSelect,
      handleTimelineSegmentClick,
      handleSegmentPlay,
      handleNavigateSegment,
      handleScrubberDrag,
      handleTimelineClick,
    ],
  );

  return (
    <ClippingWorkspaceContext.Provider value={value}>
      {children}
    </ClippingWorkspaceContext.Provider>
  );
}

export function useClippingWorkspace() {
  const context = useContext(ClippingWorkspaceContext);
  if (!context) {
    throw new Error(
      "useClippingWorkspace must be used within a ClippingWorkspaceProvider",
    );
  }
  return context;
}

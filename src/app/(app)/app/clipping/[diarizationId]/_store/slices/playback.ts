import { ObservableHint } from "@legendapp/state";
import { createRef, type RefObject } from "react";
import type { $ClippingStore } from "../clipping-store";
import { TIMELINE_CONSTANTS } from "../constants";

const { BASE_TIMESPAN, MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;

/**
 * Helper to calculate pixels per second from store state.
 */
function getPixelsPerSecond(zoomLevel: number, containerWidth: number): number {
  const visibleTimespan = (BASE_TIMESPAN * 100) / zoomLevel;
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

export function createPlaybackState(
  getStore: () => $ClippingStore,
): PlaybackState {
  // Lazy store access via proxy - defers initialization until first property access
  let _store: $ClippingStore | undefined;
  const $store = new Proxy({} as $ClippingStore, {
    get(_, prop) {
      _store ??= getStore();
      return _store[prop as keyof typeof _store];
    },
  });

  // Use module-level refs to avoid Legend State observing them
  const refs = ObservableHint.opaque({
    audioRef: createRef<HTMLAudioElement | null>(),
    scrollContainerRef: createRef<HTMLDivElement | null>(),
  });

  // ============================================================================
  // Timeline utilities
  // ============================================================================

  const timeToPixels = (time: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    return time * getPixelsPerSecond(zoomLevel, containerWidth);
  };

  const pixelsToTime = (pixels: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    const pps = getPixelsPerSecond(zoomLevel, containerWidth);
    if (pps <= 0) return 0;
    return pixels / pps;
  };

  const scrollToTime = (time: number, behavior: ScrollBehavior = "smooth") => {
    const container = refs.scrollContainerRef.current;
    if (!container) return;

    const containerWidth = $store.timeline.containerWidth.peek();
    const targetX = timeToPixels(time);
    const scrollLeft = targetX - containerWidth / 2;

    container.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior,
    });
  };

  // ============================================================================
  // Audio actions
  // ============================================================================

  const play = () => {
    $store.playback.segmentEndTime.set(null);
    refs.audioRef.current?.play();
  };

  const pause = () => {
    $store.playback.segmentEndTime.set(null);
    refs.audioRef.current?.pause();
  };

  const togglePlayback = () => {
    const isPlaying = $store.playback.isPlaying.peek();
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const seek = (time: number) => {
    const audio = refs.audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
      $store.playback.currentTime.set(audio.currentTime);
    }
  };

  const setPlaybackRate = (rate: number) => {
    const audio = refs.audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
      $store.playback.playbackRate.set(rate);
    }
  };

  const playSegment = (start: number, end: number) => {
    const audio = refs.audioRef.current;
    if (!audio) return;

    $store.playback.segmentEndTime.set(end);
    audio.currentTime = start;
    audio.play();
  };

  // ============================================================================
  // Zoom actions
  // ============================================================================

  const zoomAtPlayhead = (newZoomLevel: number) => {
    const container = refs.scrollContainerRef.current;
    if (!container) {
      $store.timeline.setZoomLevel(newZoomLevel);
      return;
    }

    const currentTime = $store.playback.currentTime.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    const oldZoomLevel = $store.timeline.zoomLevel.peek();

    // Calculate playhead position before zoom
    const oldVisibleTimespan = (BASE_TIMESPAN * 100) / oldZoomLevel;
    const oldPps = containerWidth / oldVisibleTimespan;
    const playheadPixelPos = currentTime * oldPps;

    // Get playhead's offset from left edge of viewport
    const playheadViewportOffset = playheadPixelPos - container.scrollLeft;

    // Apply zoom
    $store.timeline.setZoomLevel(newZoomLevel);

    // Calculate new playhead position after zoom
    const newVisibleTimespan = (BASE_TIMESPAN * 100) / newZoomLevel;
    const newPps = containerWidth / newVisibleTimespan;
    const newPlayheadPixelPos = currentTime * newPps;

    // Adjust scroll to keep playhead at same viewport offset
    const newScrollLeft = newPlayheadPixelPos - playheadViewportOffset;
    container.scrollLeft = Math.max(0, newScrollLeft);
  };

  const zoomIn = () => {
    const current = $store.timeline.zoomLevel.peek();
    zoomAtPlayhead(Math.min(MAX_ZOOM, current + 25));
  };

  const zoomOut = () => {
    const current = $store.timeline.zoomLevel.peek();
    zoomAtPlayhead(Math.max(MIN_ZOOM, current - 25));
  };

  // ============================================================================
  // Playback-only handlers (no selection logic)
  // ============================================================================

  const handleSegmentPlay = (segmentId: string) => {
    const segment = $store.segments.peek().find((s) => s.id === segmentId);
    if (segment) {
      playSegment(segment.start, segment.end);
      scrollToTime(segment.start);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = refs.scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const time = pixelsToTime(clickX);
    const duration = $store.playback.duration.peek();

    seek(Math.max(0, Math.min(time, duration)));
  };

  return {
    // Refs (opaque - Legend State won't track these)
    refs,

    // State
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    playbackRate: 1,
    isLoading: true,
    error: null,

    // Internal state
    segmentEndTime: null,
    animationFrameId: null,

    // Timeline utilities
    timeToPixels,
    pixelsToTime,
    scrollToTime,

    // Audio actions
    play,
    pause,
    togglePlayback,
    seek,
    setPlaybackRate,
    playSegment,

    // Zoom actions
    zoomIn,
    zoomOut,
    zoomAtPlayhead,

    // Playback-only handlers
    handleSegmentPlay,
    handleTimelineClick,
  };
}

export type PlaybackRefs = {
  audioRef: RefObject<HTMLAudioElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};
export interface PlaybackState {
  // Refs (opaque - not tracked by Legend State)
  refs: PlaybackRefs;

  // State
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;

  // Internal state (use .peek() to avoid re-renders)
  segmentEndTime: number | null;
  animationFrameId: number | null;

  // Timeline utilities
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
  scrollToTime: (time: number, behavior?: ScrollBehavior) => void;

  // Audio actions
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  playSegment: (start: number, end: number) => void;

  // Zoom actions
  zoomIn: () => void;
  zoomOut: () => void;
  zoomAtPlayhead: (newZoomLevel: number) => void;

  // Playback-only handlers (no selection logic)
  handleSegmentPlay: (segmentId: string) => void;
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

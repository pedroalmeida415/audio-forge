import { batch, ObservableHint } from "@legendapp/state";
import { createRef, type RefObject } from "react";
import type { $ClippingStore } from "~/features/clipping/store/clipping-store";
import { TIMELINE_CONSTANTS } from "~/features/clipping/store/constants";
import {
  calculatePixelsPerSecond,
  isZoomEnabled,
  pixelsToTime as zoomPixelsToTime,
  timeToPixels as zoomTimeToPixels,
} from "~/features/clipping/utils/zoom-utils";

const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;

export type PlaybackStateData = Pick<
  PlaybackState,
  | "isPlaying"
  | "duration"
  | "currentTime"
  | "playbackRate"
  | "isLoading"
  | "error"
  | "segmentEndTime"
  | "animationFrameId"
>;

const PLAYBACK_DEFAULTS: PlaybackStateData = {
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  playbackRate: 1,
  isLoading: true,
  error: null,
  segmentEndTime: null,
  animationFrameId: null,
};

export function createPlaybackState(
  getStore: () => $ClippingStore,
  initial?: Partial<PlaybackStateData>,
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

  // Merge defaults with initial overrides
  const state = { ...PLAYBACK_DEFAULTS, ...initial };

  // ============================================================================
  // Timeline utilities
  // ============================================================================

  const timeToPixels = (time: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const duration = $store.playback.duration.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    return zoomTimeToPixels(time, zoomLevel, duration, containerWidth);
  };

  const pixelsToTime = (pixels: number): number => {
    const zoomLevel = $store.timeline.zoomLevel.peek();
    const duration = $store.playback.duration.peek();
    const containerWidth = $store.timeline.containerWidth.peek();
    return zoomPixelsToTime(pixels, zoomLevel, duration, containerWidth);
  };

  const scrollToTime = (time: number) => {
    const containerWidth = $store.timeline.containerWidth.peek();
    const targetX = timeToPixels(time);
    const scrollOffset = targetX - containerWidth / 2;

    $store.timeline.setScrollOffset(scrollOffset);
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

  /**
   * Zooms while keeping a specific time position at the same viewport location.
   * Uses batch() to ensure zoom and scroll updates are atomic.
   * @param newZoomLevel - The new zoom level to apply
   * @param focalTime - The time (in seconds) to keep stationary during zoom
   * @param viewportOffset - The pixel offset from viewport left where focalTime should remain
   */
  const zoomAtPoint = (
    newZoomLevel: number,
    focalTime: number,
    viewportOffset: number,
  ) => {
    const duration = $store.playback.duration.peek();

    if (!isZoomEnabled(duration)) {
      return;
    }

    const containerWidth = $store.timeline.containerWidth.peek();

    // Clamp and round zoom level (avoids floating-point precision issues)
    const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;
    const clampedZoom = Math.round(
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel)),
    );

    // Calculate new position of focal point at the NEW zoom level
    const newFocalPixelPos = zoomTimeToPixels(
      focalTime,
      clampedZoom,
      duration,
      containerWidth,
    );

    // Calculate scroll offset to keep focal point at same viewport offset
    const newScrollOffset = newFocalPixelPos - viewportOffset;

    // Calculate max scroll offset at the NEW zoom level
    const newPps = calculatePixelsPerSecond(
      clampedZoom,
      duration,
      containerWidth,
    );
    const newTotalWidth = Math.max(duration * newPps, containerWidth);
    const newMaxOffset = Math.max(0, newTotalWidth - containerWidth);
    const clampedScrollOffset = Math.max(
      0,
      Math.min(newMaxOffset, newScrollOffset),
    );

    // Batch the state updates (calculations already done with new values)
    batch(() => {
      $store.timeline.zoomLevel.set(clampedZoom);
      $store.timeline.scrollOffset.set(clampedScrollOffset);
    });
  };

  const zoomAtPlayhead = (newZoomLevel: number) => {
    const currentTime = $store.playback.currentTime.peek();
    const playheadPixelPos = timeToPixels(currentTime);
    const scrollOffset = $store.timeline.scrollOffset.peek();
    const playheadViewportOffset = playheadPixelPos - scrollOffset;

    zoomAtPoint(newZoomLevel, currentTime, playheadViewportOffset);
  };

  /**
   * Zooms towards mouse position on timeline.
   * @param newZoomLevel - Target zoom level
   * @param mouseClientX - Mouse X position relative to viewport
   */
  const zoomAtMouse = (newZoomLevel: number, mouseClientX: number) => {
    const container = refs.scrollContainerRef.current;
    if (!container) {
      zoomAtPlayhead(newZoomLevel);
      return;
    }

    const rect = container.getBoundingClientRect();
    const mouseViewportOffset = mouseClientX - rect.left;
    const scrollOffset = $store.timeline.scrollOffset.peek();
    const mousePixelPos = scrollOffset + mouseViewportOffset;
    const mouseTime = pixelsToTime(mousePixelPos);

    zoomAtPoint(newZoomLevel, mouseTime, mouseViewportOffset);
  };

  const zoomIn = () => {
    const current = $store.timeline.zoomLevel.peek();
    zoomAtPlayhead(Math.min(MAX_ZOOM, current + 5));
  };

  const zoomOut = () => {
    const current = $store.timeline.zoomLevel.peek();
    zoomAtPlayhead(Math.max(MIN_ZOOM, current - 5));
  };

  // ============================================================================
  // Playback-only handlers (no selection logic)
  // ============================================================================

  const handleSegmentPlay = (segmentId: string) => {
    const segment = $store.segments.peek().find((s) => s.id === segmentId);
    if (segment) {
      playSegment(segment.startTime, segment.endTime);
      scrollToTime(segment.startTime);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = refs.scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const scrollOffset = $store.timeline.scrollOffset.peek();
    const clickX = e.clientX - rect.left + scrollOffset;
    const time = pixelsToTime(clickX);
    const duration = $store.playback.duration.peek();

    seek(Math.max(0, Math.min(time, duration)));
  };

  return {
    // State (defaults merged with initial overrides)
    ...state,

    // Refs (opaque - Legend State won't track these)
    refs,

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
    zoomAtMouse,

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
  scrollToTime: (time: number) => void;

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
  zoomAtMouse: (newZoomLevel: number, mouseClientX: number) => void;

  // Playback-only handlers (no selection logic)
  handleSegmentPlay: (segmentId: string) => void;
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

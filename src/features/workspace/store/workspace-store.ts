import { ref } from "valtio";
import { proxySet } from "valtio/utils";
import { batch, computed } from "valtio-reactive";
import {
  SELECTION_CONSTANTS,
  TIMELINE_CONSTANTS,
} from "~/features/workspace/store/constants";
import {
  calculatePixelsPerSecond,
  calculateVisibleTimespan,
  isZoomEnabled,
  pixelsToTime as zoomPixelsToTime,
  timeToPixels as zoomTimeToPixels,
} from "~/features/workspace/utils/zoom-utils";

const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;

export class WorkspaceStore {
  // ─── Table selection (existing, unchanged) ───
  selectedSegmentIds: Set<string> = proxySet();
  excludedSegmentIds: Set<string> = proxySet();
  isAllSelected = false;

  // ─── DOM refs (wrapped with ref() — not tracked by proxy) ───
  refs = ref({
    audioElement: null as HTMLAudioElement | null,
    scrollContainer: null as HTMLDivElement | null,
  });

  // ─── Active segment ───
  activeSegmentId: string | null = null;

  // ─── Playback ───
  isPlaying = false;
  duration = 0;
  currentTime = 0;
  playbackRate = 1;
  isLoading = true;
  playbackError: string | null = null;
  segmentEndTime: number | null = null;

  // ─── Timeline viewport ───
  zoomLevel: number = TIMELINE_CONSTANTS.DEFAULT_ZOOM;
  containerWidth = 800;
  scrollOffset = 0;

  // ─── Drag selection ───
  selectionMode: "idle" | "dragging" | "active" = "idle";
  selectionAnchorTime: number | null = null;
  selectionCurrentTime: number | null = null;
  selectionSpeaker: string | null = null;
  hoverTime: number | null = null;

  // ─── Table selection methods (existing, unchanged) ───
  toggleSelection(id: string) {
    if (this.isAllSelected) {
      if (this.excludedSegmentIds.has(id)) {
        this.excludedSegmentIds.delete(id);
      } else {
        this.excludedSegmentIds.add(id);
      }
      return;
    }
    if (this.selectedSegmentIds.has(id)) {
      this.selectedSegmentIds.delete(id);
    } else {
      this.selectedSegmentIds.add(id);
    }
  }

  selectAll() {
    this.isAllSelected = true;
    this.selectedSegmentIds.clear();
    this.excludedSegmentIds.clear();
  }

  clearSelection() {
    this.isAllSelected = false;
    this.selectedSegmentIds.clear();
    this.excludedSegmentIds.clear();
  }

  // ─── Active segment ───
  setActiveSegment(segmentId: string | null) {
    this.activeSegmentId = segmentId;
  }

  // ─── Playback actions ───
  play() {
    this.segmentEndTime = null;
    this.refs.audioElement?.play();
  }

  pause() {
    this.segmentEndTime = null;
    this.refs.audioElement?.pause();
  }

  togglePlayback() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(time: number) {
    const audio = this.refs.audioElement;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
      this.currentTime = audio.currentTime;
    }
  }

  setPlaybackRate(rate: number) {
    const audio = this.refs.audioElement;
    if (audio) {
      audio.playbackRate = rate;
      this.playbackRate = rate;
    }
  }

  playSegment(start: number, end: number) {
    const audio = this.refs.audioElement;
    if (!audio) return;
    this.segmentEndTime = end;
    audio.currentTime = start;
    audio.play();
  }

  // ─── Timeline viewport actions ───
  setZoomLevel(level: number) {
    if (!isZoomEnabled(this.duration)) {
      this.zoomLevel = MIN_ZOOM;
      return;
    }
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
  }

  setContainerWidth(width: number) {
    this.containerWidth = width;
  }

  setScrollOffset(value: number) {
    const pps = calculatePixelsPerSecond(
      this.zoomLevel,
      this.duration,
      this.containerWidth,
    );
    const totalWidth = Math.max(this.duration * pps, this.containerWidth);
    const maxOffset = Math.max(0, totalWidth - this.containerWidth);
    this.scrollOffset = Math.max(0, Math.min(maxOffset, value));
  }

  scrollBy(delta: number) {
    this.setScrollOffset(this.scrollOffset + delta);
  }

  // ─── Zoom actions ───
  zoomAtPoint(newZoomLevel: number, focalTime: number, viewportOffset: number) {
    if (!isZoomEnabled(this.duration)) return;

    const clampedZoom = Math.round(
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel)),
    );

    const newFocalPixelPos = zoomTimeToPixels(
      focalTime,
      clampedZoom,
      this.duration,
      this.containerWidth,
    );

    const newScrollOffset = newFocalPixelPos - viewportOffset;

    const newPps = calculatePixelsPerSecond(
      clampedZoom,
      this.duration,
      this.containerWidth,
    );
    const newTotalWidth = Math.max(this.duration * newPps, this.containerWidth);
    const newMaxOffset = Math.max(0, newTotalWidth - this.containerWidth);
    const clampedScrollOffset = Math.max(
      0,
      Math.min(newMaxOffset, newScrollOffset),
    );

    batch(() => {
      this.zoomLevel = clampedZoom;
      this.scrollOffset = clampedScrollOffset;
    });
  }

  zoomAtPlayhead(newZoomLevel: number) {
    const playheadPixelPos = this.timeToPixels(this.currentTime);
    const playheadViewportOffset = playheadPixelPos - this.scrollOffset;
    this.zoomAtPoint(newZoomLevel, this.currentTime, playheadViewportOffset);
  }

  zoomAtMouse(newZoomLevel: number, mouseClientX: number) {
    const container = this.refs.scrollContainer;
    if (!container) {
      this.zoomAtPlayhead(newZoomLevel);
      return;
    }

    const rect = container.getBoundingClientRect();
    const mouseViewportOffset = mouseClientX - rect.left;
    const mousePixelPos = this.scrollOffset + mouseViewportOffset;
    const mouseTime = this.pixelsToTime(mousePixelPos);

    this.zoomAtPoint(newZoomLevel, mouseTime, mouseViewportOffset);
  }

  zoomIn() {
    this.zoomAtPlayhead(Math.min(MAX_ZOOM, this.zoomLevel + 5));
  }

  zoomOut() {
    this.zoomAtPlayhead(Math.max(MIN_ZOOM, this.zoomLevel - 5));
  }

  // ─── Coordinate conversion ───
  timeToPixels(time: number): number {
    return zoomTimeToPixels(
      time,
      this.zoomLevel,
      this.duration,
      this.containerWidth,
    );
  }

  pixelsToTime(pixels: number): number {
    return zoomPixelsToTime(
      pixels,
      this.zoomLevel,
      this.duration,
      this.containerWidth,
    );
  }

  scrollToTime(time: number) {
    const targetX = this.timeToPixels(time);
    this.setScrollOffset(targetX - this.containerWidth / 2);
  }

  // ─── Drag selection actions ───
  startDrag(anchorTime: number) {
    batch(() => {
      this.selectionMode = "dragging";
      this.selectionAnchorTime = anchorTime;
      this.selectionCurrentTime = anchorTime;
      this.hoverTime = null;
    });
  }

  updateDrag(time: number) {
    this.selectionCurrentTime = Math.max(0, Math.min(time, this.duration));
  }

  confirmSelection() {
    const range = this.getSelectionRange();
    if (!range) {
      this.cancelSelection();
      return;
    }
    this.selectionMode = "active";
  }

  cancelSelection() {
    batch(() => {
      this.selectionMode = "idle";
      this.selectionAnchorTime = null;
      this.selectionCurrentTime = null;
      this.selectionSpeaker = null;
    });
  }

  setSelectionSpeaker(speaker: string) {
    this.selectionSpeaker = speaker;
  }

  moveSelection(deltaTime: number) {
    if (this.selectionMode !== "active") return;

    const anchor = this.selectionAnchorTime;
    const current = this.selectionCurrentTime;
    if (anchor === null || current === null) return;

    const start = Math.min(anchor, current);
    const end = Math.max(anchor, current);
    const selectionDuration = end - start;

    let newStart = start + deltaTime;
    let newEnd = end + deltaTime;

    if (newStart < 0) {
      newStart = 0;
      newEnd = selectionDuration;
    }
    if (newEnd > this.duration) {
      newEnd = this.duration;
      newStart = this.duration - selectionDuration;
    }

    batch(() => {
      if (anchor <= current) {
        this.selectionAnchorTime = newStart;
        this.selectionCurrentTime = newEnd;
      } else {
        this.selectionAnchorTime = newEnd;
        this.selectionCurrentTime = newStart;
      }
    });
  }

  adjustEdge(edge: "start" | "end", newTime: number) {
    if (this.selectionMode !== "active") return;

    const anchor = this.selectionAnchorTime;
    const current = this.selectionCurrentTime;
    if (anchor === null || current === null) return;

    const clampedTime = Math.max(0, Math.min(newTime, this.duration));
    const isAnchorStart = anchor <= current;

    if (edge === "start") {
      if (isAnchorStart) {
        this.selectionAnchorTime = clampedTime;
      } else {
        this.selectionCurrentTime = clampedTime;
      }
    } else {
      if (isAnchorStart) {
        this.selectionCurrentTime = clampedTime;
      } else {
        this.selectionAnchorTime = clampedTime;
      }
    }
  }

  setHoverTime(time: number | null) {
    if (this.selectionMode !== "idle") return;
    this.hoverTime = time;
  }

  // ─── Playback handlers (segments passed as parameter) ───
  handleSegmentPlay(
    segmentId: string,
    segments: { id: string; startTime: number; endTime: number }[],
  ) {
    const segment = segments.find((s) => s.id === segmentId);
    if (segment) {
      this.playSegment(segment.startTime, segment.endTime);
      this.scrollToTime(segment.startTime);
    }
  }

  handleTimelineClick(e: MouseEvent) {
    const container = this.refs.scrollContainer;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left + this.scrollOffset;
    const time = this.pixelsToTime(clickX);

    this.seek(Math.max(0, Math.min(time, this.duration)));
  }

  // ─── Non-reactive helpers (for use outside reactive contexts) ───
  getSelectionRange(): { start: number; end: number } | null {
    if (this.selectionMode === "idle") return null;
    const anchor = this.selectionAnchorTime;
    const current = this.selectionCurrentTime;
    if (anchor === null || current === null) return null;
    const start = Math.min(anchor, current);
    const end = Math.max(anchor, current);
    if (end - start < SELECTION_CONSTANTS.MIN_SELECTION_DURATION) return null;
    return { start, end };
  }

  // ─── Reset (when source changes) ───
  resetTimeline() {
    batch(() => {
      this.activeSegmentId = null;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.zoomLevel = TIMELINE_CONSTANTS.DEFAULT_ZOOM;
      this.scrollOffset = 0;
      this.selectionMode = "idle";
      this.selectionAnchorTime = null;
      this.selectionCurrentTime = null;
      this.selectionSpeaker = null;
      this.isLoading = true;
      this.clearSelection();
    });
  }
}

// ─── Computed values (created alongside the store) ───
export function createComputed(store: WorkspaceStore) {
  return computed({
    pixelsPerSecond: () =>
      calculatePixelsPerSecond(
        store.zoomLevel,
        store.duration,
        store.containerWidth,
      ),

    visibleTimespan: () =>
      calculateVisibleTimespan(store.zoomLevel, store.duration),

    totalWidth: () => {
      const pps = calculatePixelsPerSecond(
        store.zoomLevel,
        store.duration,
        store.containerWidth,
      );
      return Math.max(store.duration * pps, store.containerWidth);
    },

    maxScrollOffset: () => {
      const pps = calculatePixelsPerSecond(
        store.zoomLevel,
        store.duration,
        store.containerWidth,
      );
      const totalWidth = Math.max(store.duration * pps, store.containerWidth);
      return Math.max(0, totalWidth - store.containerWidth);
    },

    selectionRange: () => {
      if (store.selectionMode === "idle") return null;
      const { selectionAnchorTime: anchor, selectionCurrentTime: current } =
        store;
      if (anchor === null || current === null) return null;
      const start = Math.min(anchor, current);
      const end = Math.max(anchor, current);
      if (end - start < SELECTION_CONSTANTS.MIN_SELECTION_DURATION) return null;
      return { start, end };
    },

    selectionPixelBounds: () => {
      if (store.selectionMode === "idle") return null;
      const { selectionAnchorTime: anchor, selectionCurrentTime: current } =
        store;
      if (anchor === null || current === null) return null;
      const start = Math.min(anchor, current);
      const end = Math.max(anchor, current);
      if (end - start < SELECTION_CONSTANTS.MIN_SELECTION_DURATION) return null;
      const pps = calculatePixelsPerSecond(
        store.zoomLevel,
        store.duration,
        store.containerWidth,
      );
      return { left: start * pps, width: (end - start) * pps };
    },
  });
}

export type WorkspaceComputed = ReturnType<typeof createComputed>;

import {
  calculatePixelsPerSecond,
  calculateVisibleTimespan,
  isZoomEnabled,
} from "../../_utils/zoom-utils";
import type { $ClippingStore } from "../clipping-store";
import { TIMELINE_CONSTANTS } from "../constants";

export function createTimelineState(
  getStore: () => $ClippingStore,
): TimelineState {
  // Lazy store access via proxy - defers initialization until first property access
  let _store: $ClippingStore | undefined;
  const $store = new Proxy({} as $ClippingStore, {
    get(_, prop) {
      _store ??= getStore();
      return _store[prop as keyof typeof _store];
    },
  });

  return {
    zoomLevel: TIMELINE_CONSTANTS.DEFAULT_ZOOM,
    containerWidth: 800,
    scrollOffset: 0, // Virtual scroll position in pixels

    // Computed getters - used inside reactive contexts (Memo, observe, $style, etc.)
    getPixelsPerSecond: () => {
      const zoomLevel = $store.timeline.zoomLevel.get();
      const duration = $store.playback.duration.get();
      const containerWidth = $store.timeline.containerWidth.get();
      return calculatePixelsPerSecond(zoomLevel, duration, containerWidth);
    },

    getVisibleTimespan: () => {
      const zoomLevel = $store.timeline.zoomLevel.get();
      const duration = $store.playback.duration.get();
      return calculateVisibleTimespan(zoomLevel, duration);
    },

    getTotalWidth: () => {
      const duration = $store.playback.duration.get();
      const containerWidth = $store.timeline.containerWidth.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      return Math.max(duration * pps, containerWidth);
    },

    getMaxScrollOffset: () => {
      const totalWidth = $store.timeline.getTotalWidth.get();
      const containerWidth = $store.timeline.containerWidth.get();
      return Math.max(0, totalWidth - containerWidth);
    },

    setZoomLevel: (level: number) => {
      const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;
      const duration = $store.playback.duration.peek();

      // Disable zoom for short audio
      if (!isZoomEnabled(duration)) {
        $store.timeline.zoomLevel.set(MIN_ZOOM);
        return;
      }

      $store.timeline.zoomLevel.set(
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)),
      );
    },

    setContainerWidth: (width: number) => {
      $store.timeline.containerWidth.set(width);
    },

    setScrollOffset: (value: number) => {
      const maxOffset = $store.timeline.getMaxScrollOffset.peek();
      $store.timeline.scrollOffset.set(
        Math.max(0, Math.min(maxOffset, value)),
      );
    },

    scrollBy: (delta: number) => {
      const current = $store.timeline.scrollOffset.peek();
      $store.timeline.setScrollOffset(current + delta);
    },
  };
}

export interface TimelineState {
  zoomLevel: number;
  containerWidth: number;
  scrollOffset: number;

  // Computed getters - call these inside reactive contexts for fine-grained updates
  getPixelsPerSecond: () => number;
  getVisibleTimespan: () => number;
  getTotalWidth: () => number;
  getMaxScrollOffset: () => number;

  setZoomLevel: (level: number) => void;
  setContainerWidth: (width: number) => void;
  setScrollOffset: (value: number) => void;
  scrollBy: (delta: number) => void;
}

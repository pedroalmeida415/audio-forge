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
    scrollLeft: 0,

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

    setScrollLeft: (value: number) => {
      $store.timeline.scrollLeft.set(value);
    },
  };
}

export interface TimelineState {
  zoomLevel: number;
  containerWidth: number;
  scrollLeft: number;

  // Computed getters - call these inside reactive contexts for fine-grained updates
  getPixelsPerSecond: () => number;
  getVisibleTimespan: () => number;
  getTotalWidth: () => number;

  setZoomLevel: (level: number) => void;
  setContainerWidth: (width: number) => void;
  setScrollLeft: (value: number) => void;
}

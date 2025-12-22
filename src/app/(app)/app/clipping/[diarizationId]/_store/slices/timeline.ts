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

    setZoomLevel: (level: number) => {
      const { MIN_ZOOM, MAX_ZOOM } = TIMELINE_CONSTANTS;
      $store.timeline.zoomLevel.set(
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)),
      );
    },

    setContainerWidth: (width: number) => {
      $store.timeline.containerWidth.set(width);
    },
  };
}

export interface TimelineState {
  zoomLevel: number;
  containerWidth: number;
  setZoomLevel: (level: number) => void;
  setContainerWidth: (width: number) => void;
}

import type { SliceCreator, TimelineSlice } from "../types";

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const DEFAULT_ZOOM = 100;
const DEFAULT_CONTAINER_WIDTH = 800;

export const createTimelineSlice: SliceCreator<TimelineSlice> = (set) => ({
  zoomLevel: DEFAULT_ZOOM,
  containerWidth: DEFAULT_CONTAINER_WIDTH,
  setZoomLevel: (level) =>
    set((state) => {
      state.timeline.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    }),
  zoomIn: () =>
    set((state) => {
      state.timeline.zoomLevel = Math.min(
        MAX_ZOOM,
        state.timeline.zoomLevel + 25,
      );
    }),
  zoomOut: () =>
    set((state) => {
      state.timeline.zoomLevel = Math.max(
        MIN_ZOOM,
        state.timeline.zoomLevel - 25,
      );
    }),
  setContainerWidth: (width) =>
    set((state) => {
      state.timeline.containerWidth = width;
    }),
});

export const TIMELINE_CONSTANTS = {
  BASE_TIMESPAN: 60,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
} as const;

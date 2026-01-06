import { batch } from "@legendapp/state";
import type { $ClippingStore } from "~/features/clipping/store/clipping-store";
import { SELECTION_CONSTANTS } from "~/features/clipping/store/constants";

export type SelectionStateData = Pick<
  SelectionState,
  "mode" | "anchorTime" | "currentTime" | "selectedSpeaker" | "hoverTime"
>;

const SELECTION_DEFAULTS: SelectionStateData = {
  mode: "idle",
  anchorTime: null,
  currentTime: null,
  selectedSpeaker: null,
  hoverTime: null,
};

export function createSelectionState(
  getStore: () => $ClippingStore,
  initial?: Partial<SelectionStateData>,
): SelectionState {
  // Lazy store access via proxy - defers initialization until first property access
  let _store: $ClippingStore | undefined;
  const $store = new Proxy({} as $ClippingStore, {
    get(_, prop) {
      _store ??= getStore();
      return _store[prop as keyof typeof _store];
    },
  });

  // Merge defaults with initial overrides
  const state = { ...SELECTION_DEFAULTS, ...initial };

  return {
    // State (defaults merged with initial overrides)
    ...state,

    // Computed getters
    getSelectionRange: () => {
      const mode = $store.selection.mode.get();
      if (mode === "idle") return null;

      const anchor = $store.selection.anchorTime.get();
      const current = $store.selection.currentTime.get();

      if (anchor === null || current === null) return null;

      // Normalize so start < end
      const start = Math.min(anchor, current);
      const end = Math.max(anchor, current);

      // Enforce minimum selection duration
      if (end - start < SELECTION_CONSTANTS.MIN_SELECTION_DURATION) {
        return null;
      }

      return { start, end };
    },

    getSelectionPixelBounds: () => {
      const range = $store.selection.getSelectionRange.get();
      if (!range) return null;

      const pps = $store.timeline.getPixelsPerSecond.get();

      return {
        left: range.start * pps,
        width: (range.end - range.start) * pps,
      };
    },

    // Actions
    startDrag: (anchorTime: number) => {
      batch(() => {
        $store.selection.mode.set("dragging");
        $store.selection.anchorTime.set(anchorTime);
        $store.selection.currentTime.set(anchorTime);
        // Default to current selected speaker
        $store.selection.selectedSpeaker.set($store.selectedSpeakerId.peek());
        // Clear hover when dragging
        $store.selection.hoverTime.set(null);
      });
    },

    updateDrag: (time: number) => {
      const duration = $store.playback.duration.peek();
      const clampedTime = Math.max(0, Math.min(time, duration));
      $store.selection.currentTime.set(clampedTime);
    },

    confirmSelection: () => {
      const range = $store.selection.getSelectionRange.peek();
      if (!range) {
        // Selection too small, cancel instead
        $store.selection.cancelSelection();
        return;
      }
      $store.selection.mode.set("active");
    },

    cancelSelection: () => {
      batch(() => {
        $store.selection.mode.set("idle");
        $store.selection.anchorTime.set(null);
        $store.selection.currentTime.set(null);
        $store.selection.selectedSpeaker.set(null);
      });
    },

    setSelectedSpeaker: (speaker: string) => {
      $store.selection.selectedSpeaker.set(speaker);
    },

    moveSelection: (deltaTime: number) => {
      const mode = $store.selection.mode.peek();
      if (mode !== "active") return;

      const anchor = $store.selection.anchorTime.peek();
      const current = $store.selection.currentTime.peek();
      const duration = $store.playback.duration.peek();

      if (anchor === null || current === null) return;

      const start = Math.min(anchor, current);
      const end = Math.max(anchor, current);
      const selectionDuration = end - start;

      // Calculate new positions with clamping
      let newStart = start + deltaTime;
      let newEnd = end + deltaTime;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = selectionDuration;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - selectionDuration;
      }

      batch(() => {
        // Update anchor and current to maintain the selection
        // If anchor was the start, keep it as start
        if (anchor <= current) {
          $store.selection.anchorTime.set(newStart);
          $store.selection.currentTime.set(newEnd);
        } else {
          $store.selection.anchorTime.set(newEnd);
          $store.selection.currentTime.set(newStart);
        }
      });
    },

    adjustEdge: (edge: "start" | "end", newTime: number) => {
      const mode = $store.selection.mode.peek();
      if (mode !== "active") return;

      const duration = $store.playback.duration.peek();
      const anchor = $store.selection.anchorTime.peek();
      const current = $store.selection.currentTime.peek();

      if (anchor === null || current === null) return;

      const clampedTime = Math.max(0, Math.min(newTime, duration));

      // Determine which variable (anchor or current) corresponds to start/end
      const isAnchorStart = anchor <= current;

      if (edge === "start") {
        if (isAnchorStart) {
          $store.selection.anchorTime.set(clampedTime);
        } else {
          $store.selection.currentTime.set(clampedTime);
        }
      } else {
        if (isAnchorStart) {
          $store.selection.currentTime.set(clampedTime);
        } else {
          $store.selection.anchorTime.set(clampedTime);
        }
      }
    },

    setHoverTime: (time: number | null) => {
      const mode = $store.selection.mode.peek();
      // Don't update hover during drag or active selection
      if (mode !== "idle") return;

      $store.selection.hoverTime.set(time);
    },
  };
}

export type SelectionMode = "idle" | "dragging" | "active";

export interface SelectionState {
  // State
  mode: SelectionMode;
  anchorTime: number | null;
  currentTime: number | null;
  selectedSpeaker: string | null;
  hoverTime: number | null;

  // Computed getters
  getSelectionRange: () => { start: number; end: number } | null;
  getSelectionPixelBounds: () => { left: number; width: number } | null;

  // Actions
  startDrag: (anchorTime: number) => void;
  updateDrag: (currentTime: number) => void;
  confirmSelection: () => void;
  cancelSelection: () => void;
  setSelectedSpeaker: (speaker: string) => void;
  moveSelection: (deltaTime: number) => void;
  adjustEdge: (edge: "start" | "end", newTime: number) => void;
  setHoverTime: (time: number | null) => void;
}

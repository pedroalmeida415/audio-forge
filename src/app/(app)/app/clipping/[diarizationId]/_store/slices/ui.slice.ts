import type { SliceCreator, UISlice } from "../types";

export const createUISlice: SliceCreator<UISlice> = (set) => ({
  viewMode: "table",
  setViewMode: (mode) =>
    set((state) => {
      state.ui.viewMode = mode;
    }),
});

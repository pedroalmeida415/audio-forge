import type { SliceCreator, UISlice } from "../types";

export const createUISlice: SliceCreator<UISlice> = (set) => ({
  viewMode: "table",
  filters: {
    alerts: [],
    reviewed: null,
    search: "",
  },
  setViewMode: (mode) =>
    set((state) => {
      state.ui.viewMode = mode;
    }),
  setFilters: (newFilters) =>
    set((state) => {
      state.ui.filters = { ...state.ui.filters, ...newFilters };
    }),
  clearFilters: () =>
    set((state) => {
      state.ui.filters = { alerts: [], reviewed: null, search: "" };
    }),
});

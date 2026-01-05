"use client";

import { useValue } from "@legendapp/state/react";
import { useClippingStore } from "../../_context/store.context";

export function SelectionSummary() {
  const $store = useClippingStore();

  const selectedSegmentIds = useValue($store.selectedSegmentIds);

  const hasSelection = selectedSegmentIds.size > 0;

  return (
    <div
      className={`rounded-lg border p-3 transition-opacity ${
        hasSelection
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-muted/30 opacity-50"
      }`}
    >
      <div
        className={`font-medium text-sm ${hasSelection ? "text-primary" : "text-muted-foreground"}`}
      >
        {hasSelection
          ? `${selectedSegmentIds.size} segment${selectedSegmentIds.size !== 1 ? "s" : ""} selected`
          : "No segments selected"}
      </div>
    </div>
  );
}

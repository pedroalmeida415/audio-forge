"use client";

import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp, parseTimestamp } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

interface EditableTimeCellProps {
  value: number;
  segmentId: string;
  field: "start" | "end";
  minValue?: number;
  maxValue?: number;
}

export function EditableTimeCell({
  value,
  segmentId,
  field,
  minValue = 0,
  maxValue = Number.POSITIVE_INFINITY,
}: EditableTimeCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const $store = useClippingStore();

  const diarizationId = useValue($store.diarizationId);
  const segments = useValue($store.segments);

  const updateSegmentsMutation = api.diarization.updateSegments.useMutation();

  // Find segment by ID
  const segment = segments.find((s) => s.id === segmentId);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(formatTimestamp(value));
    setHasError(false);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleConfirm = () => {
    const parsed = parseTimestamp(inputValue);

    if (parsed === null) {
      setHasError(true);
      return;
    }

    // Validate bounds
    if (parsed < minValue || parsed > maxValue) {
      setHasError(true);
      return;
    }

    // Only update if value changed
    if (parsed !== value && segment) {
      const updates = field === "start" ? { start: parsed } : { end: parsed };

      updateSegmentsMutation.mutate({
        diarizationId,
        segmentIds: segmentId,
        updates,
      });
    }

    setIsEditing(false);
    setHasError(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setHasError(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const handleBlur = () => {
    // Try to confirm on blur, cancel if invalid
    const parsed = parseTimestamp(inputValue);
    if (parsed !== null && parsed >= minValue && parsed <= maxValue) {
      handleConfirm();
    } else {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setHasError(false);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-16 rounded border bg-background px-1.5 py-0.5 font-mono text-xs focus:outline-none focus:ring-1",
          hasError
            ? "border-red-500 focus:ring-red-500"
            : "border-border focus:ring-primary",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      className="cursor-text rounded px-1 py-0.5 font-mono text-xs transition-colors hover:bg-muted/50"
    >
      {formatTimestamp(value)}
    </button>
  );
}

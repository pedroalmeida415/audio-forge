"use client";

import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { formatTimestampWithMs, parseTimestamp } from "~/lib/time-utils";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface EditableTimeCellProps {
  value: number;
  segmentId: string;
  field: "startTime" | "endTime";
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
  const sourceId = useValue($store.sourceId);

  const updateSegmentsMutation = api.segment.updateSegments.useMutation();

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(formatTimestampWithMs(value));
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
    if (parsed !== value) {
      const updates =
        field === "startTime" ? { startTime: parsed } : { endTime: parsed };

      updateSegmentsMutation.mutate({
        sourceId,
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
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setHasError(false);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "h-auto w-24 px-1.5 py-0.5 font-mono text-xs",
          hasError && "border-destructive focus-visible:ring-destructive",
        )}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={handleStartEdit}
      className="h-auto cursor-text px-1 py-0.5 font-mono text-xs hover:bg-muted/50"
    >
      {formatTimestampWithMs(value)}
    </Button>
  );
}

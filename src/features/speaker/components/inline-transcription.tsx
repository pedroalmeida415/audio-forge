"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface InlineTranscriptionProps {
  segmentId: string;
  transcription: string | null;
  className?: string;
}

export function InlineTranscription({
  segmentId,
  transcription,
  className,
}: InlineTranscriptionProps) {
  const $store = useSpeakerPageStore();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(transcription ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateMutation = api.segment.updateTranscription.useMutation({
    onSuccess: () => {
      $store.updateTranscription(segmentId, value || null);
      setIsEditing(false);
    },
  });

  // Reset value when transcription changes externally
  useEffect(() => {
    setValue(transcription ?? "");
  }, [transcription]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      segmentId,
      transcription: value.trim() || null,
    });
  }, [segmentId, value, updateMutation]);

  const handleCancel = useCallback(() => {
    setValue(transcription ?? "");
    setIsEditing(false);
  }, [transcription]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (isEditing) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter transcription..."
          className="min-h-[60px] resize-none text-sm"
          disabled={updateMutation.isPending}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={updateMutation.isPending}
          >
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group -mx-2 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50",
        className,
      )}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && setIsEditing(true)}
      role="button"
      tabIndex={0}
    >
      <p className="min-h-[24px] flex-1 text-foreground/90 text-sm">
        {transcription || (
          <span className="text-muted-foreground italic">No transcription</span>
        )}
      </p>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

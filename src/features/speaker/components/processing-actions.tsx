"use client";

import { useSelector } from "@legendapp/state/react";
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";
import { useSpeakerStore } from "../context/store-context";

// ============================================================================
// Types
// ============================================================================

type TranscribeScope = "selected" | "missing";

interface FeedbackState {
  message: string;
  type: "success" | "error";
}

// ============================================================================
// Processing Actions Component
// ============================================================================

/**
 * Processing actions section for speaker sidebar.
 *
 * Provides batch processing action buttons:
 * - Transcribe: transcribe selected segments or all missing transcriptions
 * - Denoise: denoise selected segments
 * - Remove overlap: process selected segments to remove overlap
 *
 * Each action triggers tRPC mutations to enqueue jobs.
 * Buttons are disabled when no valid targets are available.
 */
export function ProcessingActions() {
  const $store = useSpeakerStore();

  // Get selected segment IDs and segments
  const selectedSegmentIds = useSelector(() => $store.selectedSegmentIds.get());
  const segments = useSelector(() => $store.segments.get());
  const filteredSegments = useSelector(() => $store.filteredSegments());

  // Compute counts for UI
  const selectedCount = selectedSegmentIds.size;
  const missingTranscriptionCount = segments.filter(
    (seg) => !seg.transcription || seg.transcription.trim() === "",
  ).length;

  // Get selected segment IDs as array for mutations
  const selectedIdsArray = Array.from(selectedSegmentIds);

  // Get segment IDs for missing transcriptions
  const missingTranscriptionIds = segments
    .filter((seg) => !seg.transcription || seg.transcription.trim() === "")
    .map((seg) => seg.id);

  // Feedback state for showing success/error messages
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  // Clear feedback after 3 seconds
  const showFeedback = useCallback(
    (message: string, type: "success" | "error") => {
      setFeedback({ message, type });
      setTimeout(() => setFeedback(null), 3000);
    },
    [],
  );

  // tRPC mutations
  const enqueueTranscription = api.speaker.enqueueTranscription.useMutation({
    onSuccess: (data) => {
      showFeedback(
        `${data.queuedCount} transcription job(s) queued`,
        "success",
      );
    },
    onError: (error) => {
      showFeedback(error.message || "Failed to queue transcription", "error");
    },
  });

  const enqueueProcessing = api.speaker.enqueueProcessing.useMutation({
    onSuccess: (data) => {
      showFeedback(`${data.queuedCount} processing job(s) queued`, "success");
    },
    onError: (error) => {
      showFeedback(error.message || "Failed to queue processing", "error");
    },
  });

  // Loading states
  const isTranscribing = enqueueTranscription.isPending;
  const isProcessing = enqueueProcessing.isPending;

  // Handle transcribe action
  const handleTranscribe = useCallback(
    (scope: TranscribeScope) => {
      const segmentIds =
        scope === "selected" ? selectedIdsArray : missingTranscriptionIds;

      if (segmentIds.length === 0) return;

      enqueueTranscription.mutate({ segmentIds });
    },
    [selectedIdsArray, missingTranscriptionIds, enqueueTranscription],
  );

  // Handle denoise action
  const handleDenoise = useCallback(() => {
    if (selectedIdsArray.length === 0) return;

    enqueueProcessing.mutate({
      segmentIds: selectedIdsArray,
      operations: ["denoise"],
    });
  }, [selectedIdsArray, enqueueProcessing]);

  // Handle remove overlap action
  const handleRemoveOverlap = useCallback(() => {
    if (selectedIdsArray.length === 0) return;

    enqueueProcessing.mutate({
      segmentIds: selectedIdsArray,
      operations: ["overlap"],
    });
  }, [selectedIdsArray, enqueueProcessing]);

  // Disable states
  const canTranscribeSelected = selectedCount > 0 && !isTranscribing;
  const canTranscribeMissing = missingTranscriptionCount > 0 && !isTranscribing;
  const canDenoise = selectedCount > 0 && !isProcessing;
  const canRemoveOverlap = selectedCount > 0 && !isProcessing;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-sm">Processing Actions</h2>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {/* Transcribe button with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              disabled={!canTranscribeSelected && !canTranscribeMissing}
            >
              <div className="flex items-center gap-2">
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                <span>Transcribe</span>
              </div>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() => handleTranscribe("selected")}
              disabled={!canTranscribeSelected}
            >
              <span>Transcribe Selected</span>
              <span className="ml-auto text-muted-foreground text-xs">
                {selectedCount}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleTranscribe("missing")}
              disabled={!canTranscribeMissing}
            >
              <span>Transcribe All Missing</span>
              <span className="ml-auto text-muted-foreground text-xs">
                {missingTranscriptionCount}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Denoise button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={!canDenoise}
          onClick={handleDenoise}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>Denoise Selected</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {selectedCount}
          </span>
        </Button>

        {/* Remove overlap button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={!canRemoveOverlap}
          onClick={handleRemoveOverlap}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
          <span>Remove Overlap</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {selectedCount}
          </span>
        </Button>
      </div>

      {/* Feedback message */}
      {feedback && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Selection hint */}
      {selectedCount === 0 && filteredSegments.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Select segments from the list to enable processing actions.
        </p>
      )}
    </div>
  );
}

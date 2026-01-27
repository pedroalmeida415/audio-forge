"use client";

import { useValue } from "@legendapp/state/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AudioPlayer } from "./audio-player";
import { InlineTranscription } from "./inline-transcription";
import { TagInput } from "./tag-input";

interface SegmentCardProps {
  segment: SegmentWithClip;
  index: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export function SegmentCard({ segment, index }: SegmentCardProps) {
  const $store = useSpeakerPageStore();
  const selectedIds = useValue($store.selectedSegmentIds);
  const pendingIds = useValue($store.pendingSegmentIds);
  const allTags = $store.getAllTags();
  const isSelected = selectedIds.has(segment.id);
  const isPending = pendingIds.has(segment.id);

  const sessionName =
    segment.session.name ?? segment.session.file.name ?? "Unnamed Session";
  const storageKey = segment.session.file.storageKey ?? "";

  const {
    sourceState,
    sourceUrl,
    loadSource,
    clipState,
    clipUrl,
    loadClip,
    hasClip,
  } = useSegmentAudio({
    sessionFileStorageKey: storageKey,
    startTime: segment.startTime,
    endTime: segment.endTime,
    clipStorageKey: segment.clip?.file.storageKey ?? null,
  });

  const updateTagsMutation = api.segment.updateTags.useMutation({
    onSuccess: (_, variables) => {
      $store.updateSegmentTags(segment.id, variables.tags);
    },
  });

  const duration = segment.endTime - segment.startTime;
  const segmentTags = segment.tags ?? [];
  const scoreDelta =
    segment.clip?.score != null && segment.score != null
      ? segment.clip.score - segment.score
      : null;

  const handleToggleSelect = () => {
    $store.toggleSelection(segment.id);
  };

  const handleAddTag = (tag: string) => {
    const newTags = [...segmentTags, tag];
    updateTagsMutation.mutate({ segmentId: segment.id, tags: newTags });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = segmentTags.filter((t) => t !== tagToRemove);
    updateTagsMutation.mutate({ segmentId: segment.id, tags: newTags });
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-all duration-200",
        isSelected
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "hover:border-border/80 hover:shadow-sm",
      )}
    >
      {/* Main content */}
      <div className="flex gap-4 p-5">
        {/* Selection checkbox */}
        <div className="flex pt-1">
          <Checkbox checked={isSelected} onCheckedChange={handleToggleSelect} />
        </div>

        {/* Audio players section */}
        <div className="flex flex-1 flex-col gap-4">
          {/* A/B Audio comparison */}
          <div className="flex items-center gap-3">
            {/* Original Segment Player */}
            <div className="min-w-0 flex-1">
              <AudioPlayer
                label="Original Segment"
                audioState={sourceState}
                audioUrl={sourceUrl}
                onLoadAudio={loadSource}
                duration={duration}
                score={segment.score}
                variant="original"
              />
            </div>

            {/* Arrow with score delta - always visible */}
            <div className="flex shrink-0 flex-col items-center gap-1 px-2">
              <ArrowRight className="size-4 text-muted-foreground" />
              <span
                className={cn(
                  "font-medium font-mono text-xs",
                  (scoreDelta ?? 0) > 0
                    ? "text-emerald-500"
                    : "text-muted-foreground",
                )}
              >
                {(scoreDelta ?? 0) > 0 ? "+" : ""}
                {(scoreDelta ?? 0).toFixed(1)}
              </span>
            </div>

            {/* Processed Clip Player */}
            <div className="min-w-0 flex-1">
              {hasClip ? (
                <AudioPlayer
                  label="Processed Clip"
                  audioState={clipState}
                  audioUrl={clipUrl}
                  onLoadAudio={loadClip}
                  duration={segment.clip?.file.duration ?? duration}
                  score={segment.clip?.score ?? null}
                  variant="processed"
                />
              ) : (
                <div className="flex h-full min-h-[76px] items-center justify-center rounded-xl border border-dashed bg-muted/20">
                  {isPending ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      No processed clip yet
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Transcription - editable with badge support */}
          <InlineTranscription
            segmentId={segment.id}
            transcription={segment.transcription}
          />

          {/* Tags */}
          <TagInput
            tags={segmentTags}
            suggestedTags={allTags}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            disabled={updateTagsMutation.isPending}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-medium font-mono text-primary/70 text-xs">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground text-xs">Session:</span>
          <span
            className="max-w-[300px] truncate font-mono text-muted-foreground text-xs"
            title={sessionName}
          >
            {sessionName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
          </span>
          <Badge variant="outline" className="font-mono">
            {formatDuration(duration)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useValue } from "@legendapp/state/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AudioPlayer } from "./audio-player";
import { InlineTranscription } from "./inline-transcription";
import { TagInput } from "./tag-input";

// ============================================================================
// Skeleton Component
// ============================================================================

interface SegmentCardSkeletonProps {
  index: number;
}

export function SegmentCardSkeleton({ index }: SegmentCardSkeletonProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-br from-primary/2 via-transparent to-background/20" />

      {/* Main content */}
      <div className="relative flex gap-4 p-5">
        {/* Selection checkbox placeholder */}
        <div className="flex pt-1">
          <Skeleton className="size-4 rounded" />
        </div>

        {/* Audio players section */}
        <div className="flex flex-1 flex-col gap-4">
          {/* A/B Audio comparison skeleton */}
          <div className="flex items-center gap-3">
            {/* Original Segment Player skeleton */}
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[76px] w-full rounded-xl" />
            </div>

            {/* Arrow with score delta */}
            <div className="flex shrink-0 flex-col items-center gap-1 px-2">
              <ArrowRight className="size-4 text-muted-foreground/30" />
              <Skeleton className="h-4 w-8" />
            </div>

            {/* Processed Clip Player skeleton */}
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[76px] w-full rounded-xl" />
            </div>
          </div>

          {/* Transcription skeleton */}
          <Skeleton className="h-10 w-full rounded-lg" />

          {/* Tags skeleton */}
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-between border-border/50 border-t bg-card/40 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-medium font-mono text-primary/80 text-xs">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component - Subscribes to its own segment entry
// ============================================================================

interface SegmentCardProps {
  segmentId: string;
  index: number;
}

export function SegmentCard({ segmentId, index }: SegmentCardProps) {
  const $store = useSpeakerPageStore();

  // Subscribe to this specific segment entry from the store
  // This gives granular reactivity - only this card re-renders when its entry changes
  const entry = useValue(() => $store.segments.get(segmentId));

  // Show skeleton if not loaded yet
  if (!entry || entry.status !== "loaded" || !entry.data) {
    return <SegmentCardSkeleton index={index} />;
  }

  return <SegmentCardInner segment={entry.data} index={index} />;
}

// ============================================================================
// Inner Component - Has all the hooks and rendering logic
// ============================================================================

interface SegmentCardInnerProps {
  segment: SegmentWithClip;
  index: number;
}

function SegmentCardInner({ segment, index }: SegmentCardInnerProps) {
  const $store = useSpeakerPageStore();
  const isSelected = useValue(() =>
    $store.selectedSegmentIds.get().has(segment.id),
  );
  const isClipPending = useValue(() =>
    $store.clipPendingIds.get().has(segment.id),
  );

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

  // Extract OVRL scores for display
  const segmentScore = segment.scores?.DNSMOS?.OVRL ?? null;
  const clipScore = segment.clip?.scores?.DNSMOS?.OVRL ?? null;
  const scoreDelta =
    clipScore != null && segmentScore != null ? clipScore - segmentScore : null;

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
        "group relative overflow-hidden rounded-2xl border transition-all duration-300",
        "border-border bg-card hover:border-primary/30 hover:shadow-md",
        isSelected && "border-primary/40 shadow-md",
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-br from-primary/2 via-transparent to-background/20" />

      {/* Main content */}
      <div className="relative flex gap-4 p-5">
        {/* Selection checkbox */}
        <div className="flex pt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleToggleSelect}
            className="border-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          />
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
                score={segmentScore}
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
                    ? "text-success"
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
                  score={clipScore}
                  variant="processed"
                />
              ) : (
                <div className="flex h-full min-h-[76px] items-center justify-center rounded-xl border border-border/50 border-dashed bg-secondary/30">
                  {isClipPending ? (
                    <div className="flex items-center gap-2 text-secondary-foreground text-sm">
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
            suggestedTags={[]}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            disabled={updateTagsMutation.isPending}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-between border-border/50 border-t bg-card/40 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-medium font-mono text-primary/80 text-xs">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground text-xs">Session:</span>
          <span
            className="max-w-[300px] truncate font-mono text-secondary-foreground text-xs"
            title={sessionName}
          >
            {sessionName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
          </span>
          <Badge variant="secondary" className="font-mono">
            {formatDuration(duration)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

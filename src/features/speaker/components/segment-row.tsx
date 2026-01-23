"use client";

import { useValue } from "@legendapp/state/react";
import { FileAudio, Loader2 } from "lucide-react";
import { Checkbox } from "~/components/ui/checkbox";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { useSegmentAudio } from "~/features/speaker/hooks/use-segment-audio";
import type { SegmentWithClip } from "~/features/speaker/store/speaker-page-store";
import { cn } from "~/lib/utils";
import { AudioPlayer } from "./audio-player";
import { InlineTranscription } from "./inline-transcription";

interface SegmentRowProps {
  segment: SegmentWithClip;
}

export function SegmentRow({ segment }: SegmentRowProps) {
  const $store = useSpeakerPageStore();
  const selectedIds = useValue($store.selectedSegmentIds);
  const pendingIds = useValue($store.pendingSegmentIds);
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

  const duration = segment.endTime - segment.startTime;

  const handleCheckboxChange = () => {
    $store.toggleSelection(segment.id);
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-colors",
        isSelected && "border-primary/50 bg-primary/5",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 border-border/50 border-b px-4 py-3">
        <Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
        <FileAudio className="size-4 text-muted-foreground" />
        <span className="truncate text-muted-foreground text-sm">
          {sessionName}
        </span>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {formatTimeRange(segment.startTime, segment.endTime)}
        </span>
      </div>

      {/* Audio players row */}
      <div className="grid grid-cols-2 gap-4 border-border/50 border-b px-4 py-3">
        <AudioPlayer
          label="Source"
          audioState={sourceState}
          audioUrl={sourceUrl}
          onLoadAudio={loadSource}
          duration={duration}
        />
        {hasClip ? (
          <AudioPlayer
            label="Processed"
            audioState={clipState}
            audioUrl={clipUrl}
            onLoadAudio={loadClip}
            duration={segment.clip?.file.duration ?? duration}
          />
        ) : isPending ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Processed
            </span>
            <div className="flex h-8 items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Processing...
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Processed
            </span>
            <div className="flex h-8 items-center text-muted-foreground text-sm italic">
              Not yet processed
            </div>
          </div>
        )}
      </div>

      {/* Transcription row */}
      <div className="px-4 py-3">
        <InlineTranscription
          segmentId={segment.id}
          transcription={segment.transcription}
        />
      </div>
    </div>
  );
}

function formatTimeRange(startTime: number, endTime: number): string {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

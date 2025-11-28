"use client";

import { ArrowLeft, Clock, Pause, Play, Scissors, Trash2 } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type Clip = {
  id: string;
  durationSeconds: number;
  extractedStartTime: number;
  extractedEndTime: number;
  createdAt: Date;
  segment: {
    pyannoteSpeakerLabel: string;
    job: {
      originalFilename: string | null;
    };
  };
};

function ClipCard({
  clip,
  onDelete,
  isDeleting,
}: {
  clip: Clip;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: urlData } = api.clip.getClipUrl.useQuery({ clipId: clip.id });

  function handlePlayPause() {
    if (!audioRef.current) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function handleEnded() {
    setIsPlaying(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-muted-foreground">
              {clip.segment.pyannoteSpeakerLabel}
            </span>
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {clip.segment.job.originalFilename ?? "Unknown source"}
          </p>
        </div>
        <Button
          disabled={isDeleting}
          onClick={() => onDelete(clip.id)}
          size="icon"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Timestamps */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTimestamp(clip.extractedStartTime)} -{" "}
            {formatTimestamp(clip.extractedEndTime)}
          </span>
          <span className="font-medium">
            {formatDuration(clip.durationSeconds)}
          </span>
        </div>

        {/* Audio player */}
        <div className="flex items-center gap-2">
          <Button
            disabled={!urlData?.url}
            onClick={handlePlayPause}
            size="icon"
            variant="outline"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          {urlData?.url && (
            // biome-ignore lint/a11y/useMediaCaption: Audio clips are speech samples without transcripts
            <audio
              className="hidden"
              onEnded={handleEnded}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              ref={audioRef}
              src={urlData.url}
            />
          )}
          <div className="h-1 flex-1 rounded-full bg-muted">
            {/* Simple progress bar placeholder */}
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Extracted {clip.createdAt.toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
}) {
  const { projectId, collectionId } = use(params);
  const utils = api.useUtils();

  const { data: collection, isLoading } = api.collection.getById.useQuery({
    id: collectionId,
  });

  const deleteClipMutation = api.clip.delete.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  function handleDeleteClip(clipId: string) {
    deleteClipMutation.mutate({ clipId });
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="mb-8 h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">Collection not found</p>
        <Link href={`/projects/${projectId}`}>
          <Button className="mt-4" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          className="mb-4 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
          href={`/projects/${projectId}`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to {collection.project.name}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-bold text-3xl">{collection.name}</h1>
            {collection.description && (
              <p className="mt-1 text-muted-foreground">
                {collection.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Clips Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-xl">
            Audio Clips ({collection.audioClips.length})
          </h2>
        </div>

        {collection.audioClips.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <Scissors className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">No clips yet</p>
            <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
              Clips are extracted from diarization segments in the clipping
              workspace
            </p>
            <Link href="/clipping">
              <Button variant="outline">
                <Scissors className="mr-2 h-4 w-4" />
                Go to Clipping
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collection.audioClips.map((clip) => (
              <ClipCard
                clip={clip}
                isDeleting={deleteClipMutation.isPending}
                key={clip.id}
                onDelete={handleDeleteClip}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

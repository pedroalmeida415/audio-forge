"use client";

import { ArrowLeft, Scissors } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useMemo, useState } from "react";
import {
  BatchProcessingToolbar,
  ClipProcessingCard,
} from "~/components/collection";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import type { ProcessingType } from "~/server/db/schema";
import { api } from "~/trpc/react";

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
}) {
  const { projectId, collectionId } = use(params);
  const utils = api.useUtils();

  // Selection state
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(
    new Set()
  );

  // Audio URL cache
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [processedAudioUrls, setProcessedAudioUrls] = useState<
    Record<string, string>
  >({});

  // Queries
  const { data: collection, isLoading } = api.collection.getById.useQuery({
    id: collectionId,
  });

  // Mutations
  const deleteClipMutation = api.clip.delete.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  const processClipMutation = api.processing.processClip.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  const batchProcessMutation = api.processing.batchProcess.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  const deleteProcessedClipMutation =
    api.processing.deleteProcessedClip.useMutation({
      onSuccess: () => {
        utils.collection.getById.invalidate({ id: collectionId });
      },
    });

  const calculateMOSMutation = api.processing.calculateMOS.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  const batchCalculateMOSMutation =
    api.processing.batchCalculateMOS.useMutation({
      onSuccess: () => {
        utils.collection.getById.invalidate({ id: collectionId });
      },
    });

  const updateTranscriptMutation =
    api.transcription.updateTranscript.useMutation({
      onSuccess: () => {
        utils.collection.getById.invalidate({ id: collectionId });
      },
    });

  const autoTranscribeMutation = api.transcription.autoTranscribe.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
    },
  });

  const batchTranscribeMutation = api.transcription.batchTranscribe.useMutation(
    {
      onSuccess: () => {
        utils.collection.getById.invalidate({ id: collectionId });
      },
    }
  );

  const clearTranscriptMutation = api.transcription.clearTranscript.useMutation(
    {
      onSuccess: () => {
        utils.collection.getById.invalidate({ id: collectionId });
      },
    }
  );

  // Get clip URL
  const getClipUrlQuery = api.clip.getClipUrl.useQuery;
  const getProcessedClipUrlQuery = api.processing.getProcessedClipUrl.useQuery;

  // Fetch audio URLs for clips
  const clipIds = useMemo(
    () => collection?.audioClips.map((c) => c.id) ?? [],
    [collection?.audioClips]
  );

  // Selection handlers
  const handleSelectClip = useCallback((clipId: string, selected: boolean) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(clipId);
      } else {
        next.delete(clipId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (collection) {
      setSelectedClipIds(new Set(collection.audioClips.map((c) => c.id)));
    }
  }, [collection]);

  const handleDeselectAll = useCallback(() => {
    setSelectedClipIds(new Set());
  }, []);

  // Batch action handlers
  const handleBatchProcess = useCallback(
    (processingType: ProcessingType, params: Record<string, number>) => {
      const clipIds = Array.from(selectedClipIds);
      if (clipIds.length === 0) return;

      batchProcessMutation.mutate({
        clipIds,
        processingType,
        params,
      });
    },
    [selectedClipIds, batchProcessMutation]
  );

  const handleBatchTranscribe = useCallback(() => {
    const clipIds = Array.from(selectedClipIds);
    if (clipIds.length === 0) return;

    batchTranscribeMutation.mutate({ clipIds });
  }, [selectedClipIds, batchTranscribeMutation]);

  const handleBatchCalculateMOS = useCallback(() => {
    const clipIds = Array.from(selectedClipIds);
    if (clipIds.length === 0) return;

    batchCalculateMOSMutation.mutate({ clipIds });
  }, [selectedClipIds, batchCalculateMOSMutation]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="mb-8 h-10 w-64" />
        <Skeleton className="mb-4 h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">Collection not found</p>
        <Link href={`/project/${projectId}`}>
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
          href={`/project/${projectId}`}
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

      {/* Batch Processing Toolbar */}
      {collection.audioClips.length > 0 && (
        <BatchProcessingToolbar
          className="mb-6"
          isBatchCalculatingMOS={batchCalculateMOSMutation.isPending}
          isBatchProcessing={batchProcessMutation.isPending}
          isBatchTranscribing={batchTranscribeMutation.isPending}
          onBatchCalculateMOS={handleBatchCalculateMOS}
          onBatchProcess={handleBatchProcess}
          onBatchTranscribe={handleBatchTranscribe}
          onDeselectAll={handleDeselectAll}
          onSelectAll={handleSelectAll}
          selectedCount={selectedClipIds.size}
          totalCount={collection.audioClips.length}
        />
      )}

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
          <div className="grid gap-4 lg:grid-cols-2">
            {collection.audioClips.map((clip) => (
              <ClipProcessingCardWrapper
                clip={clip}
                collectionId={collectionId}
                isSelected={selectedClipIds.has(clip.id)}
                key={clip.id}
                onAutoTranscribe={() =>
                  autoTranscribeMutation.mutate({ clipId: clip.id })
                }
                onCalculateMOS={() =>
                  calculateMOSMutation.mutate({ clipId: clip.id })
                }
                onClearTranscript={() =>
                  clearTranscriptMutation.mutate({ clipId: clip.id })
                }
                onDelete={() => deleteClipMutation.mutate({ clipId: clip.id })}
                onDeleteProcessed={(processedClipId) =>
                  deleteProcessedClipMutation.mutate({ processedClipId })
                }
                onProcess={(processingType, params) =>
                  processClipMutation.mutate({
                    clipId: clip.id,
                    processingType,
                    params,
                  })
                }
                onSaveTranscript={(transcript) =>
                  updateTranscriptMutation.mutate({
                    clipId: clip.id,
                    transcript,
                  })
                }
                onSelect={(selected) => handleSelectClip(clip.id, selected)}
                state={{
                  isDeleting: deleteClipMutation.isPending,
                  isProcessing:
                    processClipMutation.isPending &&
                    processClipMutation.variables?.clipId === clip.id,
                  isCalculatingMOS:
                    calculateMOSMutation.isPending &&
                    calculateMOSMutation.variables?.clipId === clip.id,
                  isSavingTranscript:
                    updateTranscriptMutation.isPending &&
                    updateTranscriptMutation.variables?.clipId === clip.id,
                  isTranscribing:
                    autoTranscribeMutation.isPending &&
                    autoTranscribeMutation.variables?.clipId === clip.id,
                  isDeletingProcessed: deleteProcessedClipMutation.isPending
                    ? (deleteProcessedClipMutation.variables?.processedClipId ??
                      null)
                    : null,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type ClipData = {
  id: string;
  durationSeconds: number | null;
  extractedStartTime: number | null;
  extractedEndTime: number | null;
  format: string | null;
  transcript: string | null;
  transcriptMetadata: {
    language?: string;
    provider?: string;
    confidence?: number;
  } | null;
  mosScore: number | null;
  createdAt: Date;
  // Denormalized source info (no segment relation)
  sourceSpeakerLabel: string | null;
  sourceFilename: string | null;
  processedClips: Array<{
    id: string;
    processingType:
      | "denoise"
      | "remove_bg_music"
      | "remove_overlap"
      | "normalize"
      | "upsample";
    processingStatus: "pending" | "processing" | "completed" | "failed";
    processingParams: Record<string, unknown> | null;
    mosScore: number | null;
    durationSeconds: number | null;
    sampleRate: number | null;
    format: string | null;
    processingErrorMessage: string | null;
    createdAt: Date;
  }>;
};

type ClipProcessingCardWrapperProps = {
  clip: ClipData;
  collectionId: string;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onDelete: () => void;
  onProcess: (
    processingType: ProcessingType,
    params: Record<string, number>
  ) => void;
  onSaveTranscript: (transcript: string) => void;
  onAutoTranscribe: () => void;
  onClearTranscript: () => void;
  onCalculateMOS: () => void;
  onDeleteProcessed: (processedClipId: string) => void;
  state: {
    isDeleting: boolean;
    isProcessing: boolean;
    isCalculatingMOS: boolean;
    isSavingTranscript: boolean;
    isTranscribing: boolean;
    isDeletingProcessed: string | null;
  };
};

function ClipProcessingCardWrapper({
  clip,
  collectionId,
  isSelected,
  onSelect,
  onDelete,
  onProcess,
  onSaveTranscript,
  onAutoTranscribe,
  onClearTranscript,
  onCalculateMOS,
  onDeleteProcessed,
  state,
}: ClipProcessingCardWrapperProps) {
  // Fetch audio URL for original clip
  const { data: urlData } = api.clip.getClipUrl.useQuery({ clipId: clip.id });

  // Map for processed clip URLs (fetched on demand)
  const [processedUrlsCache, setProcessedUrlsCache] = useState<
    Record<string, string>
  >({});

  const getProcessedClipUrl = useCallback(
    (processedClipId: string) => processedUrlsCache[processedClipId],
    [processedUrlsCache]
  );

  const handlePlayProcessed = useCallback(async (processedClipId: string) => {
    // If URL not cached, we could fetch it, but for now we'll rely on the query
    // In a real app, you'd want to prefetch these
  }, []);

  const handleDownloadProcessed = useCallback(
    async (processedClipId: string) => {
      // Trigger download - the component will use getProcessedClipUrl
    },
    []
  );

  return (
    <ClipProcessingCard
      audioUrl={urlData?.url}
      clip={clip}
      getProcessedClipUrl={getProcessedClipUrl}
      isCalculatingMOS={state.isCalculatingMOS}
      isDeleting={state.isDeleting}
      isDeletingProcessed={state.isDeletingProcessed}
      isProcessing={state.isProcessing}
      isSavingTranscript={state.isSavingTranscript}
      isSelected={isSelected}
      isTranscribing={state.isTranscribing}
      onAutoTranscribe={onAutoTranscribe}
      onCalculateMOS={onCalculateMOS}
      onClearTranscript={onClearTranscript}
      onDelete={onDelete}
      onDeleteProcessed={onDeleteProcessed}
      onDownloadProcessed={handleDownloadProcessed}
      onPlayProcessed={handlePlayProcessed}
      onProcess={onProcess}
      onSaveTranscript={onSaveTranscript}
      onSelect={onSelect}
    />
  );
}

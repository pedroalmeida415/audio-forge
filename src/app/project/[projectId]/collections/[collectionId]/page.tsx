"use client";

import { ArrowLeft, Check, Scissors, X } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useMemo, useState } from "react";
import { ClipEditorSidebar } from "~/components/collection/clip-editor-sidebar";
import { ClipListItem } from "~/components/collection/clip-list-item";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import type { ProcessingType } from "~/server/db/schema";
import { api } from "~/trpc/react";

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
  // Active clip for sidebar (click vs checkbox selection)
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // Audio URL cache for the active clip
  const [processedUrlsCache, setProcessedUrlsCache] = useState<
    Record<string, string>
  >({});

  // Queries
  const { data: collection, isLoading } = api.collection.getById.useQuery({
    id: collectionId,
  });

  // Get audio URL for active clip
  const activeClip = useMemo(() => {
    if (!activeClipId || !collection) return null;
    return collection.audioClips.find((c) => c.id === activeClipId) ?? null;
  }, [activeClipId, collection]);

  const { data: activeClipUrlData } = api.clip.getClipUrl.useQuery(
    { clipId: activeClipId ?? "" },
    { enabled: !!activeClipId }
  );

  // Mutations
  const deleteClipMutation = api.clip.delete.useMutation({
    onSuccess: () => {
      utils.collection.getById.invalidate({ id: collectionId });
      // Clear selection if deleted clip was selected
      setSelectedClipIds((prev) => {
        const next = new Set(prev);
        if (deleteClipMutation.variables?.clipId) {
          next.delete(deleteClipMutation.variables.clipId);
        }
        return next;
      });
      if (activeClipId === deleteClipMutation.variables?.clipId) {
        setActiveClipId(null);
      }
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

  const handleClickClip = useCallback((clipId: string) => {
    setActiveClipId(clipId);
    // Also select it
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      next.add(clipId);
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
    setActiveClipId(null);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setActiveClipId(null);
    setSelectedClipIds(new Set());
  }, []);

  // Get selected clips data
  const selectedClipsData = useMemo(() => {
    if (!collection) return [];
    return collection.audioClips.filter((c) => selectedClipIds.has(c.id));
  }, [collection, selectedClipIds]);

  // Transform clip data for components
  const normalizeClip = useCallback((clip: ClipData) => ({
    id: clip.id,
    durationSeconds: clip.durationSeconds ?? 0,
    extractedStartTime: clip.extractedStartTime ?? 0,
    extractedEndTime: clip.extractedEndTime ?? 0,
    format: clip.format ?? "wav",
    transcript: clip.transcript,
    transcriptMetadata: clip.transcriptMetadata,
    mosScore: clip.mosScore,
    createdAt: clip.createdAt,
    sourceSpeakerLabel: clip.sourceSpeakerLabel,
    sourceFilename: clip.sourceFilename,
    processedClips: clip.processedClips.map((p) => ({
      id: p.id,
      processingType: p.processingType,
      processingStatus: p.processingStatus,
      processingParams: p.processingParams,
      mosScore: p.mosScore,
      durationSeconds: p.durationSeconds,
      sampleRate: p.sampleRate,
      format: p.format,
      errorMessage: p.processingErrorMessage,
      createdAt: p.createdAt,
    })),
  }), []);

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

  const getProcessedClipUrl = useCallback(
    (processedClipId: string) => processedUrlsCache[processedClipId],
    [processedUrlsCache]
  );

  const hasSelection = selectedClipIds.size > 0;
  const allSelected =
    collection &&
    selectedClipIds.size === collection.audioClips.length &&
    collection.audioClips.length > 0;

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6">
          <Skeleton className="mb-6 h-10 w-64" />
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
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
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main content area - clips list */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <Link
            className="mb-2 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
            href={`/project/${projectId}`}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to {collection.project.name}
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-bold text-2xl">{collection.name}</h1>
              {collection.description && (
                <p className="mt-1 text-muted-foreground text-sm">
                  {collection.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{collection.audioClips.length} clips</span>
            </div>
          </div>
        </div>

        {/* Selection toolbar */}
        {collection.audioClips.length > 0 && (
          <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-2">
            <div className="flex items-center gap-3">
              <Button
                className="gap-1.5"
                onClick={allSelected ? handleDeselectAll : handleSelectAll}
                size="sm"
                variant="outline"
              >
                {allSelected ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Select All
                  </>
                )}
              </Button>

              <span className="text-muted-foreground text-sm">
                {selectedClipIds.size} of {collection.audioClips.length} selected
              </span>
            </div>

          </div>
        )}

        {/* Clips list */}
        <ScrollArea className="flex-1">
          <div className="p-6">
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
              <div className="space-y-2">
                {collection.audioClips.map((clip) => (
                  <ClipListItemWrapper
                    clip={clip}
                    isActive={activeClipId === clip.id}
                    isSelected={selectedClipIds.has(clip.id)}
                    key={clip.id}
                    onClick={() => handleClickClip(clip.id)}
                    onSelect={(selected) => handleSelectClip(clip.id, selected)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right sidebar - editor */}
      <div className="w-[400px] shrink-0">
        <ClipEditorSidebar
          audioUrl={activeClipUrlData?.url}
          getProcessedClipUrl={getProcessedClipUrl}
          hasClips={collection.audioClips.length > 0}
          isBatchCalculatingMOS={batchCalculateMOSMutation.isPending}
          isBatchProcessing={batchProcessMutation.isPending}
          isBatchTranscribing={batchTranscribeMutation.isPending}
          isCalculatingMOS={
            calculateMOSMutation.isPending &&
            calculateMOSMutation.variables?.clipId === activeClipId
          }
          isDeleting={
            deleteClipMutation.isPending &&
            deleteClipMutation.variables?.clipId === activeClipId
          }
          isDeletingProcessed={
            deleteProcessedClipMutation.isPending
              ? (deleteProcessedClipMutation.variables?.processedClipId ?? null)
              : null
          }
          isProcessing={
            processClipMutation.isPending &&
            processClipMutation.variables?.clipId === activeClipId
          }
          isSavingTranscript={
            updateTranscriptMutation.isPending &&
            updateTranscriptMutation.variables?.clipId === activeClipId
          }
          isTranscribing={
            autoTranscribeMutation.isPending &&
            autoTranscribeMutation.variables?.clipId === activeClipId
          }
          onAutoTranscribe={(clipId) =>
            autoTranscribeMutation.mutate({ clipId })
          }
          onBatchCalculateMOS={handleBatchCalculateMOS}
          onBatchProcess={handleBatchProcess}
          onBatchTranscribe={handleBatchTranscribe}
          onCalculateMOS={(clipId) =>
            calculateMOSMutation.mutate({ clipId })
          }
          onClearTranscript={(clipId) =>
            clearTranscriptMutation.mutate({ clipId })
          }
          onClose={handleCloseSidebar}
          onDelete={(clipId) => deleteClipMutation.mutate({ clipId })}
          onDeleteProcessed={(processedClipId) =>
            deleteProcessedClipMutation.mutate({ processedClipId })
          }
          onProcess={(clipId, processingType, params) =>
            processClipMutation.mutate({
              clipId,
              processingType,
              params,
            })
          }
          onSaveTranscript={(clipId, transcript) =>
            updateTranscriptMutation.mutate({
              clipId,
              transcript,
            })
          }
          selectedClips={selectedClipsData.map(normalizeClip)}
        />
      </div>
    </div>
  );
}

// Wrapper component to fetch audio URL for each clip
function ClipListItemWrapper({
  clip,
  isSelected,
  isActive,
  onSelect,
  onClick,
}: {
  clip: ClipData;
  isSelected: boolean;
  isActive: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
}) {
  const { data: urlData } = api.clip.getClipUrl.useQuery({ clipId: clip.id });

  const normalizedClip = {
    id: clip.id,
    durationSeconds: clip.durationSeconds ?? 0,
    extractedStartTime: clip.extractedStartTime ?? 0,
    extractedEndTime: clip.extractedEndTime ?? 0,
    format: clip.format ?? "wav",
    transcript: clip.transcript,
    transcriptMetadata: clip.transcriptMetadata,
    mosScore: clip.mosScore,
    createdAt: clip.createdAt,
    sourceSpeakerLabel: clip.sourceSpeakerLabel,
    sourceFilename: clip.sourceFilename,
    processedClips: clip.processedClips.map((p) => ({
      id: p.id,
      processingType: p.processingType,
      processingStatus: p.processingStatus,
      mosScore: p.mosScore,
    })),
  };

  return (
    <ClipListItem
      audioUrl={urlData?.url}
      clip={normalizedClip}
      isActive={isActive}
      isSelected={isSelected}
      onClick={onClick}
      onSelect={onSelect}
    />
  );
}

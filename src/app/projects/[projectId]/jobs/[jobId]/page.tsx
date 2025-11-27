"use client";

import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { SegmentList } from "~/components/segments/segment-list";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WaveformViewer } from "~/components/waveform/waveform-viewer";
import { api } from "~/trpc/react";

function getStatusVariant(status: string) {
  switch (status) {
    case "completed":
      return "default";
    case "processing":
    case "uploading":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export default function JobWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const { projectId, jobId } = use(params);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );

  const utils = api.useUtils();

  const {
    data: job,
    isLoading,
    refetch,
  } = api.diarization.getJob.useQuery(
    { id: jobId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        // Poll every 3 seconds if still processing
        if (
          data?.status === "processing" ||
          data?.status === "uploading" ||
          data?.status === "pending"
        ) {
          return 3000;
        }
        return false;
      },
    }
  );

  const { data: audioUrl } = api.diarization.getAudioUrl.useQuery(
    { audioFileId: selectedFileId! },
    { enabled: !!selectedFileId }
  );

  const extractClips = api.clip.extractClips.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  // Set first file as selected when job loads
  useEffect(() => {
    const firstFile = job?.audioFiles[0];
    if (
      job?.audioFiles &&
      job.audioFiles.length > 0 &&
      !selectedFileId &&
      firstFile
    ) {
      setSelectedFileId(firstFile.id);
    }
  }, [job?.audioFiles, selectedFileId]);

  const selectedFile = job?.audioFiles.find((f) => f.id === selectedFileId);
  const segments = selectedFile?.segments ?? [];

  const updateSegmentTimestamps = api.segment.updateTimestamps.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  const handleSegmentUpdate = useCallback(
    (segmentId: string, startTime: number, endTime: number) => {
      updateSegmentTimestamps.mutate({
        segmentId,
        editedStartTime: startTime,
        editedEndTime: endTime,
      });
    },
    [updateSegmentTimestamps]
  );

  const handleExtractClips = () => {
    if (!selectedFileId) {
      return;
    }

    // Get segments that are approved and have collections assigned
    const extractableSegments = segments.filter(
      (s) => s.status === "approved" && s.collectionId
    );

    if (extractableSegments.length === 0) {
      return;
    }

    extractClips.mutate({
      audioFileId: selectedFileId,
      segmentIds: extractableSegments.map((s) => s.id),
      format: "mp3",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="mb-8 h-10 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">Job not found</p>
        <Link href={`/projects/${projectId}`}>
          <Button className="mt-4" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Button>
        </Link>
      </div>
    );
  }

  const extractableCount = segments.filter(
    (s) => s.status === "approved" && s.collectionId
  ).length;

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          className="mb-4 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
          href={`/projects/${projectId}`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to {job.project.name}
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-bold text-2xl">Diarization Job</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {job.audioFiles.length} file
              {job.audioFiles.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
            {(job.status === "processing" || job.status === "uploading") && (
              <Button onClick={() => refetch()} size="sm" variant="outline">
                <RefreshCw className="mr-2 h-3 w-3" />
                Refresh
              </Button>
            )}
            {job.status === "completed" && (
              <Button
                disabled={extractClips.isPending || extractableCount === 0}
                onClick={handleExtractClips}
              >
                {extractClips.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Extract Clips ({extractableCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Processing indicator */}
      {(job.status === "processing" ||
        job.status === "uploading" ||
        job.status === "pending") && (
        <div className="mb-6 rounded-lg border bg-muted/50 p-6 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-medium">Processing audio files...</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {job.processedFiles} of {job.totalFiles} files processed
          </p>
        </div>
      )}

      {/* Error state */}
      {job.status === "failed" && (
        <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-6">
          <p className="font-medium text-destructive">
            Job failed: {job.errorMessage ?? "Unknown error"}
          </p>
        </div>
      )}

      {/* Main workspace - only show when job is completed */}
      {job.status === "completed" && job.audioFiles.length > 0 && (
        <>
          {/* File tabs */}
          {job.audioFiles.length > 1 && (
            <Tabs
              className="mb-6"
              onValueChange={setSelectedFileId}
              value={selectedFileId ?? undefined}
            >
              <TabsList>
                {job.audioFiles.map((file) => (
                  <TabsTrigger key={file.id} value={file.id}>
                    {file.originalFilename}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Workspace grid */}
          <div className="grid gap-6 lg:grid-cols-[1fr,350px]">
            {/* Waveform section */}
            <div className="space-y-4">
              <WaveformViewer
                audioUrl={audioUrl?.url ?? null}
                onSegmentSelect={setSelectedSegmentId}
                onSegmentUpdate={handleSegmentUpdate}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
              />

              {/* Selected file info */}
              {selectedFile && (
                <div className="flex gap-4 text-muted-foreground text-sm">
                  <span>{selectedFile.originalFilename}</span>
                  {selectedFile.durationSeconds && (
                    <span>
                      {Math.floor(selectedFile.durationSeconds / 60)}:
                      {Math.floor(selectedFile.durationSeconds % 60)
                        .toString()
                        .padStart(2, "0")}
                    </span>
                  )}
                  <span>{segments.length} segments</span>
                </div>
              )}
            </div>

            {/* Segment list sidebar */}
            <div className="h-[600px] rounded-lg border p-4">
              {selectedFileId && (
                <SegmentList
                  audioFileId={selectedFileId}
                  onSegmentSelect={setSelectedSegmentId}
                  projectId={projectId}
                  segments={segments}
                  selectedSegmentId={selectedSegmentId}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

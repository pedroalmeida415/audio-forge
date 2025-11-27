"use client";

import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { SegmentList } from "~/components/segments/segment-list";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { WaveformViewer } from "~/components/waveform/waveform-viewer";
import { useJobWorkspace } from "~/hooks/use-job-workspace";

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

function ProcessingIndicator({ status }: { status: string }) {
  return (
    <div className="mb-6 rounded-lg border bg-muted/50 p-6 text-center">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
      <p className="font-medium">Processing audio file...</p>
      <p className="mt-1 text-muted-foreground text-sm">Status: {status}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return (
    <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-6">
      <p className="font-medium text-destructive">
        Job failed: {message ?? "Unknown error"}
      </p>
    </div>
  );
}

type JobHeaderProps = {
  projectId: string;
  projectName: string;
  filename: string | null;
  status: string;
  isExtracting: boolean;
  extractableCount: number;
  onRefetch: () => void;
  onExtractClips: () => void;
};

function JobHeader({
  projectId,
  projectName,
  filename,
  status,
  isExtracting,
  extractableCount,
  onRefetch,
  onExtractClips,
}: JobHeaderProps) {
  return (
    <div className="mb-6">
      <Link
        className="mb-4 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
        href={`/projects/${projectId}`}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to {projectName}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold text-2xl">Diarization Job</h1>
          {filename && (
            <p className="mt-1 text-muted-foreground text-sm">{filename}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={getStatusVariant(status)}>{status}</Badge>
          {(status === "processing" || status === "uploading") && (
            <Button onClick={onRefetch} size="sm" variant="outline">
              <RefreshCw className="mr-2 h-3 w-3" />
              Refresh
            </Button>
          )}
          {status === "completed" && (
            <Button
              disabled={isExtracting || extractableCount === 0}
              onClick={onExtractClips}
            >
              {isExtracting ? (
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
  );
}

export default function JobWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const { projectId, jobId } = use(params);

  const {
    job,
    isLoading,
    selectedSegmentId,
    setSelectedSegmentId,
    segments,
    audioUrl,
    handleSegmentUpdate,
    handleExtractClips,
    isExtracting,
    extractableCount,
    refetch,
  } = useJobWorkspace(jobId);

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

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <JobHeader
        extractableCount={extractableCount}
        filename={job.originalFilename}
        isExtracting={isExtracting}
        onExtractClips={handleExtractClips}
        onRefetch={refetch}
        projectId={projectId}
        projectName={job.project.name}
        status={job.status}
      />

      {/* Processing indicator */}
      {(job.status === "processing" ||
        job.status === "uploading" ||
        job.status === "pending") && (
        <ProcessingIndicator status={job.status} />
      )}

      {/* Error state */}
      {job.status === "failed" && <ErrorMessage message={job.errorMessage} />}

      {/* Main workspace - only show when job is completed */}
      {job.status === "completed" && (
        <>
          {/* Workspace grid */}
          <div className="grid gap-6 lg:grid-cols-[1fr,350px]">
            {/* Waveform section */}
            <div className="space-y-4">
              <WaveformViewer
                audioUrl={audioUrl}
                onSegmentSelect={setSelectedSegmentId}
                onSegmentUpdate={handleSegmentUpdate}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
              />

              {/* File info */}
              {job.originalFilename && (
                <div className="flex gap-4 text-muted-foreground text-sm">
                  <span>{job.originalFilename}</span>
                  {job.durationSeconds && (
                    <span>
                      {Math.floor(job.durationSeconds / 60)}:
                      {Math.floor(job.durationSeconds % 60)
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
              <SegmentList
                jobId={jobId}
                onSegmentSelect={setSelectedSegmentId}
                projectId={projectId}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

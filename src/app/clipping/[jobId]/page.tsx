"use client";

import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { SpeakerWorkspace } from "~/components/clipping/speaker-workspace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { WaveformViewer } from "~/components/waveform/waveform-viewer";
import { useSegmentActions } from "~/hooks/use-segment-actions";
import { useSpeakerWorkspace } from "~/hooks/use-speaker-workspace";

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
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary/60" />
        <p className="font-medium text-lg">Processing audio...</p>
        <p className="mt-1 text-muted-foreground text-sm">{status}</p>
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/5 p-8 text-center">
        <p className="font-medium text-destructive text-lg">
          Processing Failed
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          {message ?? "An unknown error occurred"}
        </p>
      </div>
    </div>
  );
}

export default function ClippingWorkspacePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);

  const workspace = useSpeakerWorkspace(jobId);
  const { createCollection, isCreatingCollection } = useSegmentActions();

  const {
    job,
    isLoading,
    audioUrl,
    visibleSegments,
    activeSegmentId,
    setActiveSegmentId,
    handleExtractClips,
    isExtracting,
    extractableGroupCount,
    speakerOrder,
    refetch,
  } = workspace;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1800px] px-6 py-8">
          <Skeleton className="mb-8 h-8 w-48" />
          <Skeleton className="h-[70vh]" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Job not found</p>
          <Link href="/clipping">
            <Button className="mt-4" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jobs
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing =
    job.status === "processing" ||
    job.status === "uploading" ||
    job.status === "pending";

  return (
    <div className="min-h-screen bg-background">
      {/* Asymmetric header - pushed to the left */}
      <div className="border-b bg-card/30">
        <div className="mx-auto max-w-[1800px] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                href="/clipping"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">Jobs</span>
              </Link>

              <div className="h-6 w-px bg-border" />

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-semibold text-lg tracking-tight">
                    {job.originalFilename ?? "Untitled"}
                  </h1>
                  <Badge
                    className="text-xs"
                    variant={getStatusVariant(job.status)}
                  >
                    {job.status}
                  </Badge>
                </div>
                {job.durationSeconds && (
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {Math.floor(job.durationSeconds / 60)}:
                    {Math.floor(job.durationSeconds % 60)
                      .toString()
                      .padStart(2, "0")}{" "}
                    · {visibleSegments.length} segments · {speakerOrder.length}{" "}
                    speakers
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isProcessing && (
                <Button onClick={refetch} size="sm" variant="ghost">
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Refresh
                </Button>
              )}
              {job.status === "completed" && (
                <Button
                  disabled={isExtracting || extractableGroupCount === 0}
                  onClick={() => handleExtractClips()}
                  size="sm"
                >
                  {isExtracting ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-3.5 w-3.5" />
                  )}
                  Extract
                  {extractableGroupCount > 0 && ` (${extractableGroupCount})`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Processing/Error states */}
      {isProcessing && <ProcessingIndicator status={job.status} />}
      {job.status === "failed" && <ErrorMessage message={job.errorMessage} />}

      {/* Main workspace */}
      {job.status === "completed" && (
        <div className="flex h-[calc(100vh-65px)] flex-col">
          {/* Main content area - speaker groups take priority */}
          <div className="flex-1 overflow-hidden">
            <div className="mx-auto h-full max-w-[1800px] px-6 py-5">
              <div className="flex h-full gap-6">
                {/* Primary: Speaker assignment area */}
                <div className="flex flex-1 flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-base">
                        Assign Speakers to Collections
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        {speakerOrder.length} speakers ·{" "}
                        {visibleSegments.length} segments
                      </p>
                    </div>
                    {extractableGroupCount > 0 && (
                      <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                        <span className="font-medium text-primary text-xs">
                          {extractableGroupCount} ready to extract
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-hidden rounded-xl border bg-card/30">
                    <div className="h-full p-4">
                      <SpeakerWorkspace
                        isCreatingCollection={isCreatingCollection}
                        onCreateCollection={createCollection}
                        workspace={workspace}
                      />
                    </div>
                  </div>
                </div>

                {/* Secondary: Stats sidebar - narrower */}
                <div className="hidden w-72 shrink-0 flex-col gap-4 xl:flex">
                  {/* Quick stats - compact */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                      <div className="font-bold text-xl tabular-nums">
                        {speakerOrder.length}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Speakers
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                      <div className="font-bold text-xl tabular-nums">
                        {visibleSegments.length}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Segments
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                      <div className="font-bold text-primary text-xl tabular-nums">
                        {extractableGroupCount}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Ready
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                      <div className="font-bold text-xl tabular-nums">
                        {job.durationSeconds
                          ? `${Math.floor(job.durationSeconds / 60)}m`
                          : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Duration
                      </div>
                    </div>
                  </div>

                  {/* Workflow - minimal */}
                  <div className="rounded-lg border border-dashed p-3">
                    <div className="space-y-2 text-muted-foreground text-xs">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-[9px] text-primary">
                          1
                        </span>
                        <span>Assign collections to speakers</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-[9px] text-primary">
                          2
                        </span>
                        <span>Remove or reassign segments</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-[9px] text-primary">
                          3
                        </span>
                        <span>Extract clips</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Waveform - bottom dock */}
          <div className="shrink-0 border-t bg-card/50">
            <div className="mx-auto max-w-[1800px] px-6 py-3">
              <WaveformViewer
                audioUrl={audioUrl}
                onSegmentSelect={setActiveSegmentId}
                segments={visibleSegments}
                selectedSegmentId={activeSegmentId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

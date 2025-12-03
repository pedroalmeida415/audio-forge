"use client";

import {
  AudioLines,
  CheckCircle,
  Clock,
  FileAudio,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

function getJobStatusVariant(status: string) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "processing":
    case "uploading":
      return "accent" as const;
    case "failed":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

interface JobSelectorProps {
  onSelect?: (jobId: string) => void;
}

export function JobSelector({ onSelect }: JobSelectorProps) {
  const { data: jobs, isLoading } = api.diarization.listJobs.useQuery({
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            className="h-28 rounded-xl"
            key={`skeleton-${i}`}
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/50 border-dashed bg-card/50 px-8 py-16 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-accent/10">
          <AudioLines className="size-8 text-accent" />
        </div>
        <h3 className="mb-2 font-display font-semibold text-xl">
          No diarization jobs yet
        </h3>
        <p className="mb-8 max-w-sm text-muted-foreground text-sm">
          Start by uploading an audio file for diarization to identify speakers
          and their speech segments.
        </p>
        <Button asChild size="lg">
          <Link href="/diarization">Start a new diarization job</Link>
        </Button>
      </div>
    );
  }

  // Filter to only completed jobs for clipping
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const otherJobs = jobs.filter((job) => job.status !== "completed");

  return (
    <div className="space-y-8">
      {completedJobs.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="size-4 text-success" />
            <h3 className="font-medium text-sm">
              Ready for clipping ({completedJobs.length})
            </h3>
          </div>
          <div className="grid gap-4">
            {completedJobs.map((job, index) => (
              <div
                className="animate-fade-up opacity-0"
                key={job.id}
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
              >
                <JobCard job={job} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </section>
      )}

      {otherJobs.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <h3 className="font-medium text-muted-foreground text-sm">
              Other jobs ({otherJobs.length})
            </h3>
          </div>
          <div className="grid gap-4">
            {otherJobs.map((job, index) => (
              <div
                className="animate-fade-up opacity-0"
                key={job.id}
                style={{
                  animationDelay: `${0.1 + completedJobs.length * 0.05 + index * 0.05}s`,
                }}
              >
                <JobCard job={job} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface JobCardProps {
  job: {
    id: string;
    status: string;
    originalFilename: string | null;
    createdAt: Date;
    segments: { id: string; status: string; collectionId: string | null }[];
  };
  onSelect?: (jobId: string) => void;
}

function JobCard({ job, onSelect }: JobCardProps) {
  const isClickable = job.status === "completed";
  const segmentCount = job.segments.length;
  const assignedCount = job.segments.filter((s) => s.collectionId).length;
  const progress = segmentCount > 0 ? (assignedCount / segmentCount) * 100 : 0;

  const content = (
    <Card className={isClickable ? "cursor-pointer" : "opacity-60"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-3 truncate font-medium text-base">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <FileAudio className="size-5 text-muted-foreground" />
          </div>
          <span className="truncate">
            {job.originalFilename ?? `Job ${job.id.slice(0, 8)}...`}
          </span>
        </CardTitle>
        <Badge
          className="ml-2 shrink-0"
          variant={getJobStatusVariant(job.status)}
        >
          {job.status}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {job.createdAt.toLocaleDateString()}
            </span>
            {segmentCount > 0 && (
              <span className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-primary" />
                {assignedCount}/{segmentCount} segments
              </span>
            )}
          </div>

          {/* Mini progress indicator */}
          {segmentCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-muted-foreground text-xs">
                {Math.round(progress)}%
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isClickable) {
    if (onSelect) {
      return (
        <button
          className="w-full text-left"
          onClick={() => onSelect(job.id)}
          type="button"
        >
          {content}
        </button>
      );
    }
    return <Link href={`/clipping/${job.id}`}>{content}</Link>;
  }

  return content;
}

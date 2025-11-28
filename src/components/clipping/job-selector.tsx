"use client";

import { AudioLines, Clock, FileAudio } from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

function getJobStatusVariant(status: string) {
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
          <Skeleton className="h-24" key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <AudioLines className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-muted-foreground">No diarization jobs yet</p>
        <p className="mb-4 text-muted-foreground text-sm">
          Start by uploading an audio file for diarization
        </p>
        <Link
          className="text-primary text-sm underline-offset-4 hover:underline"
          href="/diarization"
        >
          Start a new diarization job
        </Link>
      </div>
    );
  }

  // Filter to only completed jobs for clipping
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const otherJobs = jobs.filter((job) => job.status !== "completed");

  return (
    <div className="space-y-6">
      {completedJobs.length > 0 && (
        <div>
          <h3 className="mb-3 font-medium text-muted-foreground text-sm">
            Ready for clipping ({completedJobs.length})
          </h3>
          <div className="grid gap-3">
            {completedJobs.map((job) => (
              <JobCard job={job} key={job.id} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      {otherJobs.length > 0 && (
        <div>
          <h3 className="mb-3 font-medium text-muted-foreground text-sm">
            Other jobs ({otherJobs.length})
          </h3>
          <div className="grid gap-3">
            {otherJobs.map((job) => (
              <JobCard job={job} key={job.id} onSelect={onSelect} />
            ))}
          </div>
        </div>
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

  const content = (
    <Card
      className={
        isClickable ? "cursor-pointer transition-colors hover:bg-muted/50" : ""
      }
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 truncate font-medium text-base">
          <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
          {job.originalFilename ?? `Job ${job.id.slice(0, 8)}...`}
        </CardTitle>
        <Badge
          className="ml-2 shrink-0"
          variant={getJobStatusVariant(job.status)}
        >
          {job.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-muted-foreground text-xs">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {job.createdAt.toLocaleDateString()}
          </span>
          {segmentCount > 0 && (
            <span>
              {assignedCount}/{segmentCount} segments assigned
            </span>
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

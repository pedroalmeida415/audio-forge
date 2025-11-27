"use client";

import { ArrowLeft, AudioLines, FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { StartJobDialog } from "~/components/jobs/start-job-dialog";
import { CreateCollectionDialog } from "~/components/projects/create-collection-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { data: project, isLoading } = api.project.getById.useQuery({
    id: projectId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="mb-8 h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">Project not found</p>
        <Link href="/projects">
          <Button className="mt-4" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <Link
          className="mb-4 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
          href="/projects"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-bold text-3xl">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          <StartJobDialog projectId={projectId}>
            <Button>
              <AudioLines className="mr-2 h-4 w-4" />
              New Diarization Job
            </Button>
          </StartJobDialog>
        </div>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">
            Diarization Jobs ({project.diarizationJobs.length})
          </TabsTrigger>
          <TabsTrigger value="collections">
            Collections ({project.collections.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-6" value="jobs">
          {project.diarizationJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <AudioLines className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">
                No diarization jobs yet
              </p>
              <StartJobDialog projectId={projectId}>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Start your first job
                </Button>
              </StartJobDialog>
            </div>
          ) : (
            <div className="space-y-4">
              {project.diarizationJobs.map((job) => (
                <Link
                  href={`/projects/${projectId}/jobs/${job.id}`}
                  key={job.id}
                >
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-medium text-base">
                        {job.originalFilename ?? `Job ${job.id.slice(0, 8)}...`}
                      </CardTitle>
                      <Badge variant={getJobStatusVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-xs">
                        Created {job.createdAt.toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-6" value="collections">
          <div className="mb-4 flex justify-end">
            <CreateCollectionDialog projectId={projectId}>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Collection
              </Button>
            </CreateCollectionDialog>
          </div>

          {project.collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">No collections yet</p>
              <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
                Collections are created when you assign speakers to segments
                after diarization
              </p>
              <CreateCollectionDialog projectId={projectId}>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Create a collection manually
                </Button>
              </CreateCollectionDialog>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {project.collections.map((collection) => (
                <Card key={collection.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {collection.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {collection.description && (
                      <p className="mb-2 text-muted-foreground text-sm">
                        {collection.description}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      Created {collection.createdAt.toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

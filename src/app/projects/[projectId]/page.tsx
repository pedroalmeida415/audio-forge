"use client";

import { ArrowLeft, FolderOpen, Plus, Scissors } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { CreateCollectionDialog } from "~/components/projects/create-collection-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

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
      {/* Header */}
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
          <CreateCollectionDialog projectId={projectId}>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Collection
            </Button>
          </CreateCollectionDialog>
        </div>
      </div>

      {/* Collections Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-xl">
            Collections ({project.collections.length})
          </h2>
        </div>

        {project.collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">No collections yet</p>
            <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
              Collections are created when you assign speakers to segments in
              the clipping workspace
            </p>
            <Link href="/clipping">
              <Button variant="outline">
                <Scissors className="mr-2 h-4 w-4" />
                Go to Clipping
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {project.collections.map((collection) => (
              <Link
                href={`/projects/${projectId}/collections/${collection.id}`}
                key={collection.id}
              >
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {collection.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {collection.description && (
                      <p className="mb-2 line-clamp-2 text-muted-foreground text-sm">
                        {collection.description}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      Created {collection.createdAt.toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

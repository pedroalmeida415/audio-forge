"use client";

import { ArrowLeft, Scissors, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { api } from "~/trpc/react";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [project] = api.projects.getById.useSuspenseQuery({ id: projectId });

  if (!project) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          className="mb-4 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
          href="/app"
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
          <Link href={`/app/project/${projectId}/clipping`}>
            <Button variant="outline">
              <Scissors className="mr-2 h-4 w-4" />
              Go to Clipping
            </Button>
          </Link>
        </div>
      </div>

      {/* Speakers Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-xl">
            Speakers ({project.speakers.length})
          </h2>
        </div>

        {project.speakers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <User className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">No speakers yet</p>
            <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
              Speakers are created when you run diarization or manually add them
              in the clipping workspace
            </p>
            <Link href={`/app/project/${projectId}/clipping`}>
              <Button variant="outline">
                <Scissors className="mr-2 h-4 w-4" />
                Go to Clipping
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {project.speakers.map((speaker) => (
              <Card
                key={speaker.id}
                className="h-full transition-colors hover:bg-muted/50"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{speaker.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="mb-2 h-2 w-8 rounded"
                    style={{ backgroundColor: speaker.color ?? "#888" }}
                  />
                  <p className="text-muted-foreground text-xs">
                    Created {speaker.createdAt.toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

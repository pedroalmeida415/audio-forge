"use client";

import { Plus } from "lucide-react";
import { CreateProjectDialog } from "~/components/projects/create-project-dialog";
import { ProjectCard } from "~/components/projects/project-card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export default function ProjectsPage() {
  const { data: projects, isLoading } = api.project.list.useQuery();

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your TTS dataset projects
          </p>
        </div>
        <CreateProjectDialog>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </CreateProjectDialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton className="h-[180px]" key={i} />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <p className="mb-4 text-muted-foreground">No projects yet</p>
          <CreateProjectDialog>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create your first project
            </Button>
          </CreateProjectDialog>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

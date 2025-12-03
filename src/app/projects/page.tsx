"use client";

import { FolderPlus, Sparkles } from "lucide-react";
import { CreateProjectDialog } from "~/components/projects/create-project-dialog";
import { ProjectCard } from "~/components/projects/project-card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export default function ProjectsPage() {
  const { data: projects, isLoading } = api.project.list.useQuery();

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      {/* Header Section */}
      <div
        className="mb-10 animate-fade-up opacity-0"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-bold font-display text-4xl tracking-tight">
              Projects
            </h1>
            <p className="max-w-lg text-muted-foreground">
              Manage your TTS dataset projects. Each project contains
              collections of audio segments organized for training.
            </p>
          </div>
          <CreateProjectDialog>
            <Button className="shrink-0" size="lg">
              <FolderPlus className="mr-2 size-5" />
              New Project
            </Button>
          </CreateProjectDialog>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => i).map((index) => (
            <div
              className="animate-fade-up opacity-0"
              key={index}
              style={{ animationDelay: `${0.15 + index * 0.05}s` }}
            >
              <Skeleton className="h-[180px] rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && projects?.length === 0 && (
        <div
          className="flex flex-1 animate-fade-up items-center justify-center opacity-0"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex max-w-md flex-col items-center rounded-2xl border border-border/50 border-dashed bg-card/50 px-8 py-16 text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="size-8 text-primary" />
            </div>
            <h3 className="mb-2 font-display font-semibold text-xl">
              No projects yet
            </h3>
            <p className="mb-8 text-muted-foreground text-sm">
              Create your first project to start building voice datasets for TTS
              training.
            </p>
            <CreateProjectDialog>
              <Button size="lg">
                <FolderPlus className="mr-2 size-5" />
                Create your first project
              </Button>
            </CreateProjectDialog>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {!isLoading && projects && projects.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <div
              className="animate-fade-up opacity-0"
              key={project.id}
              style={{ animationDelay: `${0.15 + index * 0.05}s` }}
            >
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

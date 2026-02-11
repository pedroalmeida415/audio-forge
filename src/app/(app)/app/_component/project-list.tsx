"use client";

import { FolderPlusIcon, SparklesIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectCard } from "./project-card";

export function ProjectList() {
  const [projects] = api.projects.list.useSuspenseQuery();

  if (projects.length === 0) {
    return (
      <div className="fade-in slide-in-from-bottom-3 flex flex-1 animate-in items-center justify-center fill-mode-both delay-200">
        <div className="flex max-w-md flex-col items-center rounded-2xl border border-border/50 border-dashed bg-card/50 px-8 py-16 text-center">
          <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <SparklesIcon className="size-8 text-primary" />
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
              <FolderPlusIcon className="mr-2 size-5" />
              Create your first project
            </Button>
          </CreateProjectDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project, index) => (
        <div
          className="fade-in slide-in-from-bottom-3 animate-in fill-mode-both"
          key={project.id}
          style={{ animationDelay: `${0.15 + index * 0.05}s` }}
        >
          <ProjectCard project={project} />
        </div>
      ))}
    </div>
  );
}

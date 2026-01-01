import { FolderPlusIcon } from "lucide-react";
import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api, HydrateClient } from "~/trpc/server";
import { CreateProjectDialog } from "./_component/create-project-dialog";
import { FloatingNav } from "./_component/floating-nav";
import { ProjectList } from "./_component/project-list";

export default async function Home() {
  void api.projects.list.prefetch();

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
              Manage your TTS dataset projects. Each project contains speakers
              and audio segments organized for training.
            </p>
          </div>
          <CreateProjectDialog>
            <Button className="shrink-0" size="lg">
              <FolderPlusIcon className="mr-2 size-5" />
              New Project
            </Button>
          </CreateProjectDialog>
        </div>
      </div>

      <HydrateClient>
        <Suspense
          fallback={
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
          }
        >
          <ProjectList />
        </Suspense>
      </HydrateClient>
      <FloatingNav />
    </div>
  );
}

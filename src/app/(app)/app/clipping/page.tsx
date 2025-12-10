import { Suspense } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api, HydrateClient } from "~/trpc/server";
import { FloatingNav } from "../_component/floating-nav";
import { CompletedDiarizationList } from "./_components/completed-diarization-list";

export default async function ClippingPage() {
  void api.diarization.list.prefetch();

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      {/* Header Section */}
      <div
        className="mb-10 animate-fade-up opacity-0"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="space-y-2">
          <h1 className="font-bold font-display text-4xl tracking-tight">
            Clipping Workspace
          </h1>
          <p className="max-w-lg text-muted-foreground">
            Select a completed diarization to review and clip speaker segments.
          </p>
        </div>
      </div>

      {/* Completed Diarizations List */}
      <HydrateClient>
        <Suspense
          fallback={
            <div className="grid gap-4">
              {Array.from({ length: 3 }, (_, i) => i).map((index) => (
                <Skeleton className="h-24 rounded-xl" key={index} />
              ))}
            </div>
          }
        >
          <CompletedDiarizationList />
        </Suspense>
      </HydrateClient>

      <FloatingNav />
    </div>
  );
}

import { Suspense } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api, HydrateClient } from "~/trpc/server";
import { FloatingNav } from "../_component/floating-nav";
import { DiarizationList } from "./_components/diarization-list";
import { DiarizationUpload } from "./_components/diarization-upload";

export default async function DiarizationPage() {
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
            Speaker Diarization
          </h1>
          <p className="max-w-lg text-muted-foreground">
            Upload audio files to identify and separate different speakers.
            Results will be processed in the background.
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div
        className="mb-8 animate-fade-up opacity-0"
        style={{ animationDelay: "0.15s" }}
      >
        <DiarizationUpload />
      </div>

      {/* Diarizations List */}
      <HydrateClient>
        <Suspense
          fallback={
            <div className="grid gap-4">
              {Array.from({ length: 3 }, (_, i) => i).map((index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          }
        >
          <DiarizationList />
        </Suspense>
      </HydrateClient>

      <FloatingNav />
    </div>
  );
}

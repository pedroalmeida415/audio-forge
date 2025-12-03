"use client";

import { Scissors } from "lucide-react";
import { JobSelector } from "~/components/clipping/job-selector";

export default function ClippingPage() {
  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div
          className="mb-10 animate-fade-up opacity-0"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent/10">
            <Scissors className="size-7 text-accent" />
          </div>
          <h1 className="mb-2 font-bold font-display text-4xl tracking-tight">
            Clipping Workspace
          </h1>
          <p className="text-muted-foreground">
            Select a completed diarization job to start assigning segments to
            collections and extracting clips.
          </p>
        </div>

        {/* Content */}
        <div
          className="animate-fade-up opacity-0"
          style={{ animationDelay: "0.2s" }}
        >
          <JobSelector />
        </div>
      </div>
    </div>
  );
}

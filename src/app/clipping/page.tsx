"use client";

import { JobSelector } from "~/components/clipping/job-selector";

export default function ClippingPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 font-bold text-3xl">Clipping Workspace</h1>
        <p className="mb-8 text-muted-foreground">
          Select a completed diarization job to start assigning segments to
          collections and extracting clips.
        </p>
        <JobSelector />
      </div>
    </div>
  );
}

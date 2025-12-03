"use client";

import { Users } from "lucide-react";
import { DiarizationContent } from "~/components/diarization/diarization-content";

export default function DiarizationPage() {
  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div
          className="mb-10 animate-fade-up opacity-0"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="size-7 text-primary" />
          </div>
          <h1 className="mb-2 font-bold font-display text-4xl tracking-tight">
            New Diarization Job
          </h1>
          <p className="text-muted-foreground">
            Upload an audio file for speaker diarization. The file will be
            processed to identify different speakers and their speech segments.
          </p>
        </div>

        {/* Content */}
        <div
          className="animate-fade-up opacity-0"
          style={{ animationDelay: "0.2s" }}
        >
          <DiarizationContent />
        </div>
      </div>
    </div>
  );
}

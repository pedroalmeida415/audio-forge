"use client";

import { DiarizationContent } from "~/components/diarization/diarization-content";

export default function DiarizationPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 font-bold text-3xl">New Diarization Job</h1>
        <p className="mb-8 text-muted-foreground">
          Upload an audio file for speaker diarization. The file will be
          processed to identify different speakers and their speech segments.
        </p>
        <DiarizationContent />
      </div>
    </div>
  );
}

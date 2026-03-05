"use client";

import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { SourcePicker } from "~/features/workspace/components/source-picker";
import { SpeakerPicker } from "~/features/workspace/components/speaker-picker";
import { ExportDialog } from "~/features/workspace/components/export-dialog";

function PickerFallback() {
  return <Skeleton className="h-9 w-32 rounded-lg" />;
}

export function WorkspaceHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-border border-b bg-background px-4">
      <div className="flex items-center gap-1">
        <Suspense fallback={<PickerFallback />}>
          <SourcePicker />
        </Suspense>
        <Suspense fallback={<PickerFallback />}>
          <SpeakerPicker />
        </Suspense>
      </div>

      <ExportDialog>
        <Button variant="outline">Export</Button>
      </ExportDialog>
    </header>
  );
}

"use client";

import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { SourcePicker } from "~/features/workspace/components/source-picker";
import { SpeakerPicker } from "~/features/workspace/components/speaker-picker";

function PickerFallback() {
  return <Skeleton className="h-9 w-32 rounded-lg" />;
}

export function WorkspaceHeader({ projectId }: { projectId: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-border border-b px-4">
      <div className="flex items-center gap-1">
        <Suspense fallback={<PickerFallback />}>
          <SourcePicker projectId={projectId} />
        </Suspense>
        <Suspense fallback={<PickerFallback />}>
          <SpeakerPicker projectId={projectId} />
        </Suspense>
      </div>

      <Button variant="outline" disabled>
        Export
      </Button>
    </header>
  );
}

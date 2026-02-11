"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { ClipStudioTimeline } from "./clip-studio-timeline";

export function ClipStudioPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    null,
  );

  const { data: sources } = api.source.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const getSourceLabel = (source: NonNullable<typeof sources>[number]) =>
    source.name ??
    source.storageKey?.split("/").pop() ??
    "Untitled";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="sticky bottom-0 z-20 border-border border-t bg-background"
    >
      <div className="flex h-10 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">Clip Studio</span>

          {sources && sources.length > 0 && (
            <Select
              value={selectedSourceId ?? ""}
              onValueChange={(value) => {
                setSelectedSourceId(value);
                if (!open) setOpen(true);
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {getSourceLabel(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <CollapsibleTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="bg-card">
        <ClipStudioTimeline
          projectId={projectId}
          sourceId={selectedSourceId}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

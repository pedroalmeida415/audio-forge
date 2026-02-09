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
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  const { data: sessions } = api.clippingSession.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const getSessionLabel = (session: NonNullable<typeof sessions>[number]) =>
    session.name ??
    session.file?.name ??
    session.file?.storageKey?.split("/").pop() ??
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

          {sessions && sessions.length > 0 && (
            <Select
              value={selectedSessionId ?? ""}
              onValueChange={(value) => {
                setSelectedSessionId(value);
                if (!open) setOpen(true);
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {getSessionLabel(session)}
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
          sessionId={selectedSessionId}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

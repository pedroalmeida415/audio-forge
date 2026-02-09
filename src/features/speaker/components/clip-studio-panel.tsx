"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";

export function ClipStudioPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="sticky bottom-0 border-border border-t bg-background"
    >
      <div className="flex h-10 items-center justify-between px-4">
        <span className="font-medium text-sm">Clip Studio</span>
        <CollapsibleTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="bg-card">
        <div className="p-4">Clip Studio content</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

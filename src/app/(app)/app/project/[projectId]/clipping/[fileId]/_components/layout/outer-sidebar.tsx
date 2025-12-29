"use client";

import { useValue } from "@legendapp/state/react";
import { Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useClippingStore } from "../../_context/store.context";

/**
 * Narrow outer sidebar with the Speakers button.
 * Opens the SpeakersDrawer when clicked.
 */
export function OuterSidebar() {
  const $store = useClippingStore();
  const speakerCount = useValue(() => $store.speakers.get().length);

  const handleOpenSpeakers = () => {
    $store.openSpeakersDrawer();
  };

  return (
    <aside className="flex w-14 flex-col items-center border-l bg-muted/30 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10"
            onClick={handleOpenSpeakers}
          >
            <Users className="h-5 w-5" />
            {/* Speaker count badge */}
            {speakerCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground">
                {speakerCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Speakers ({speakerCount})</p>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}

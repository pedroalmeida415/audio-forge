"use client";

import { useValue } from "@legendapp/state/react";
import { Square, Volume2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSpeakersStore } from "~/features/speakers/context/speakers.context";

export function PlayingIndicator() {
  const $store = useSpeakersStore();
  const playingCount = useValue($store.playingCount);

  if (playingCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-primary/20 border-b bg-primary/5 px-4 py-2">
      <Volume2 className="h-4 w-4 animate-pulse text-primary" />
      <span className="text-sm">
        {playingCount} segment{playingCount > 1 ? "s" : ""} playing
      </span>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => $store.stopAllSegments()}
        className="h-7 gap-1 text-xs"
      >
        <Square className="h-3 w-3" />
        Stop all
      </Button>
    </div>
  );
}

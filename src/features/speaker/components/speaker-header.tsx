"use client";

import { useValue } from "@legendapp/state/react";
import { ArrowLeft, Volume2 } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export function SpeakerHeader() {
  const $store = useSpeakerPageStore();
  const speaker = useValue($store.speaker);
  const stats = useValue($store.stats);
  const projectId = useValue($store.projectId);

  return (
    <div className="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        asChild
        className="text-secondary-foreground hover:bg-secondary hover:text-foreground"
      >
        <Link href={`/app/project/${projectId}`}>
          <ArrowLeft className="size-5" />
        </Link>
      </Button>

      <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-md">
        <Volume2 className="size-5 text-primary-foreground" />
      </div>

      <div className="flex flex-col">
        <h1 className="font-semibold text-foreground text-lg">
          {speaker.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          {stats.totalSegments} segments - {formatDuration(stats.totalDuration)}{" "}
          total
        </p>
      </div>
    </div>
  );
}

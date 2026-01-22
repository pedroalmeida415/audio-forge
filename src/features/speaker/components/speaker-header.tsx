"use client";

import { useValue } from "@legendapp/state/react";
import { ArrowLeft, User } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";

export function SpeakerHeader() {
  const $store = useSpeakerPageStore();
  const speaker = useValue($store.speaker);
  const projectId = useValue($store.projectId);

  return (
    <div className="flex items-center gap-4 border-b pb-6">
      <Button variant="ghost" size="icon" asChild>
        <Link href={`/app/project/${projectId}`}>
          <ArrowLeft className="size-5" />
        </Link>
      </Button>

      <div
        className="flex size-10 items-center justify-center rounded-full"
        style={{ backgroundColor: speaker.color }}
      >
        <User className="size-5 text-white" />
      </div>

      <div className="flex flex-col">
        <h1 className="font-semibold text-xl">{speaker.name}</h1>
        <p className="text-muted-foreground text-sm">Speaker segments</p>
      </div>
    </div>
  );
}

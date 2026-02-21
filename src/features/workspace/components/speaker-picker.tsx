"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { workspaceParams } from "~/features/workspace/search-params";
import type { Speaker } from "~/server/db/schema";
import { api } from "~/trpc/react";

export function SpeakerPicker() {
  const { projectId } = useParams<{ projectId: string }>();

  const [{ sourceId, speakerId }, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    speakerId: workspaceParams.speakerId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });

  const [projectSpeakers] = api.speaker.getByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const { data: sourceSpeakers, isLoading: isLoadingSourceSpeakers } =
    api.speaker.getBySource.useQuery(
      { sourceId: sourceId ?? "" },
      { enabled: !!sourceId, refetchOnWindowFocus: false },
    );

  const handleSelectSpeaker = (id: string | null) => {
    void setQueryState({ speakerId: id, activeSegmentId: null });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-sm">Speaker:</span>
      <Select
        value={speakerId ?? ""}
        onValueChange={(val) => {
          if (val === "clear") {
            handleSelectSpeaker(null);
          } else {
            handleSelectSpeaker(val);
          }
        }}
      >
        <SelectTrigger className="h-8 w-[240px] text-xs">
          <SelectValue placeholder="Select a speaker..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {speakerId && (
              <SelectItem value="clear" className="text-muted-foreground">
                Clear selection
              </SelectItem>
            )}
            {projectSpeakers.map((speaker) => (
              <SpeakerItem key={speaker.id} speaker={speaker} />
            ))}
            <SourceSpeakersSection
              speakers={sourceSpeakers}
              isLoading={isLoadingSourceSpeakers}
              enabled={!!sourceId}
            />
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function SpeakerItem({ speaker }: { speaker: Speaker }) {
  return (
    <SelectItem value={speaker.id}>
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: speaker.color }}
        />
        <span className="truncate">{speaker.name}</span>
      </div>
    </SelectItem>
  );
}

function SourceSpeakersSection({
  speakers,
  isLoading,
  enabled,
}: {
  speakers: Speaker[] | undefined;
  isLoading: boolean;
  enabled: boolean;
}) {
  if (!enabled) return null;

  if (isLoading) {
    return (
      <>
        <Separator className="my-1" />
        <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          Loading source speakers...
        </div>
      </>
    );
  }

  if (!speakers?.length) return null;

  return (
    <>
      <Separator className="my-1" />
      <div className="px-2 py-1.5 text-muted-foreground text-xs">
        Source speakers
      </div>
      {speakers.map((speaker) => (
        <SpeakerItem key={speaker.id} speaker={speaker} />
      ))}
    </>
  );
}

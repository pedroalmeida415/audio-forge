"use client";

import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "~/components/ui/navigation-menu";
import { Separator } from "~/components/ui/separator";
import { workspaceParams } from "~/features/workspace/search-params";
import type { Speaker } from "~/server/db/schema";
import { api } from "~/trpc/react";

export function SpeakerPicker({ projectId }: { projectId: string }) {
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [speakerId, setSpeakerId] = useQueryState(
    "speakerId",
    workspaceParams.speakerId,
  );

  const [projectSpeakers] = api.speaker.getAllByProjectId.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const { data: sourceSpeakers, isLoading: isLoadingSourceSpeakers } =
    api.speaker.getAllBySourceId.useQuery(
      { sourceId: sourceId ?? "" },
      { enabled: !!sourceId, refetchOnWindowFocus: false },
    );

  const selectedSpeaker =
    projectSpeakers.find((s) => s.id === speakerId) ??
    sourceSpeakers?.find((s) => s.id === speakerId);

  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            Speaker:{" "}
            <span className="ml-1 max-w-[160px] truncate text-muted-foreground">
              {selectedSpeaker?.name ?? "None"}
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-[240px] p-1">
              {speakerId && (
                <li>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      className="w-full text-muted-foreground"
                      onClick={() => setSpeakerId(null)}
                    >
                      Clear selection
                    </button>
                  </NavigationMenuLink>
                </li>
              )}
              {projectSpeakers.map((speaker) => (
                <SpeakerItem
                  key={speaker.id}
                  speaker={speaker}
                  active={speaker.id === speakerId}
                  onSelect={() => setSpeakerId(speaker.id)}
                />
              ))}
              <SourceSpeakersSection
                speakers={sourceSpeakers}
                isLoading={isLoadingSourceSpeakers}
                speakerId={speakerId}
                onSelect={setSpeakerId}
                enabled={!!sourceId}
              />
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function SpeakerItem({
  speaker,
  active,
  onSelect,
}: {
  speaker: Speaker;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <NavigationMenuLink asChild active={active}>
        <button
          type="button"
          className="flex w-full items-center gap-2"
          onClick={onSelect}
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: speaker.color }}
          />
          <span className="truncate">{speaker.name}</span>
        </button>
      </NavigationMenuLink>
    </li>
  );
}

function SourceSpeakersSection({
  speakers,
  isLoading,
  speakerId,
  onSelect,
  enabled,
}: {
  speakers: Speaker[] | undefined;
  isLoading: boolean;
  speakerId: string | null;
  onSelect: (id: string) => void;
  enabled: boolean;
}) {
  if (!enabled) return null;

  if (isLoading) {
    return (
      <>
        <Separator className="my-1" />
        <li className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          Loading source speakers...
        </li>
      </>
    );
  }

  if (!speakers?.length) return null;

  return (
    <>
      <Separator className="my-1" />
      <li className="px-2 py-1.5 text-muted-foreground text-xs">
        Source speakers
      </li>
      {speakers.map((speaker) => (
        <SpeakerItem
          key={speaker.id}
          speaker={speaker}
          active={speaker.id === speakerId}
          onSelect={() => onSelect(speaker.id)}
        />
      ))}
    </>
  );
}

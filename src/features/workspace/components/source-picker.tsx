"use client";

import { useQueryState } from "nuqs";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "~/components/ui/navigation-menu";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

export function SourcePicker({ projectId }: { projectId: string }) {
  const [sourceId, setSourceId] = useQueryState(
    "sourceId",
    workspaceParams.sourceId,
  );

  const [sources] = api.source.listByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const selectedSource = sources.find((s) => s.id === sourceId);

  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            Source:{" "}
            <span className="ml-1 max-w-[200px] truncate text-muted-foreground">
              {selectedSource
                ? (selectedSource.name ??
                  selectedSource.storageKey?.split("/").pop())
                : "None"}
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-[320px] p-1">
              {sourceId && (
                <li>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      className="w-full text-muted-foreground"
                      onClick={() => setSourceId(null)}
                    >
                      Clear selection
                    </button>
                  </NavigationMenuLink>
                </li>
              )}
              {sources.map((source) => (
                <li key={source.id}>
                  <NavigationMenuLink asChild active={source.id === sourceId}>
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => setSourceId(source.id)}
                    >
                      <span className="truncate">
                        {source.name ?? source.storageKey?.split("/").pop()}
                      </span>
                    </button>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

"use client";

import { Loader2, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "~/components/ui/navigation-menu";
import { useWorkspaceUpload } from "~/features/workspace/components/workspace-upload-layer";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

export function SourcePicker() {
  const { projectId } = useParams<{ projectId: string }>();
  const { openFilePicker, isUploading, ingestError, ingestStatus } =
    useWorkspaceUpload();

  const [{ sourceId }, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    segmentId: workspaceParams.segmentId,
  });

  const [sources] = api.source.listByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const selectedSource = sources.find((source) => source.id === sourceId);
  const selectedStatus = sourceId ? ingestStatus : null;
  const isIngesting =
    selectedStatus === "pending" || selectedStatus === "processing";

  const handleSelectSource = (id: string | null) => {
    void setQueryState({ sourceId: id, segmentId: null });
  };

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
              {isIngesting && " (processing)"}
              {selectedStatus === "failed" && " (failed)"}
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-[320px] p-1">
              <li>
                <NavigationMenuLink asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2"
                    onClick={openFilePicker}
                  >
                    {isUploading ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="size-4 text-muted-foreground" />
                    )}
                    <span>Upload source</span>
                  </button>
                </NavigationMenuLink>
              </li>
              {sourceId && (
                <li>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      className="w-full text-muted-foreground"
                      onClick={() => handleSelectSource(null)}
                    >
                      Clear selection
                    </button>
                  </NavigationMenuLink>
                </li>
              )}
              {selectedStatus === "failed" && ingestError && (
                <li className="px-2 py-1 text-destructive text-xs">
                  {ingestError}
                </li>
              )}
              {sources.map((source) => (
                <li key={source.id}>
                  <NavigationMenuLink asChild active={source.id === sourceId}>
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => handleSelectSource(source.id)}
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

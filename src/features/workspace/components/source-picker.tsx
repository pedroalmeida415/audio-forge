"use client";

import { Loader2, Upload } from "lucide-react";
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
import { useWorkspaceUpload } from "~/features/workspace/components/workspace-upload-layer";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

export function SourcePicker() {
  const { projectId } = useParams<{ projectId: string }>();
  const { openFilePicker, isUploading, ingestError, ingestStatus } =
    useWorkspaceUpload();

  const [{ sourceId }, setQueryState] = useQueryStates({
    sourceId: workspaceParams.sourceId,
    activeSegmentId: workspaceParams.activeSegmentId,
  });

  const [sources] = api.source.listByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const selectedStatus = sourceId ? ingestStatus : null;
  const isIngesting =
    selectedStatus === "pending" || selectedStatus === "processing";

  const handleSelectSource = (id: string | null) => {
    void setQueryState({ sourceId: id, activeSegmentId: null });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-sm">Source:</span>
      <Select
        value={sourceId ?? ""}
        onValueChange={(val) => {
          if (val === "upload") {
            openFilePicker();
          } else if (val === "clear") {
            handleSelectSource(null);
          } else {
            handleSelectSource(val);
          }
        }}
      >
        <SelectTrigger className="h-8 w-[300px] text-xs">
          <SelectValue placeholder="Select a source..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="upload">
              <div className="flex items-center gap-2">
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="size-4 text-muted-foreground" />
                )}
                <span>Upload source</span>
              </div>
            </SelectItem>
            {sourceId && (
              <SelectItem value="clear" className="text-muted-foreground">
                Clear selection
              </SelectItem>
            )}
            {selectedStatus === "failed" && ingestError && (
              <div className="px-2 py-1 text-destructive text-xs">
                {ingestError}
              </div>
            )}
            {sources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name ?? source.storageKey?.split("/").pop()}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {isIngesting && (
        <span className="text-muted-foreground text-xs">(processing)</span>
      )}
      {selectedStatus === "failed" && (
        <span className="text-destructive text-xs">(failed)</span>
      )}
    </div>
  );
}

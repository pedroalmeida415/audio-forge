"use client";

import { ArrowLeft, Focus, ScissorsIcon, Table2 } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getSpeakerColor } from "~/lib/speaker-colors";
import { useClippingWorkspaceStore } from "../_context/store.context";
import type { ViewMode } from "../_store/clipping-workspace-store";
import {
  getSpeakerDisplayName,
  getUniqueSpeakers,
} from "../_utils/segment-utils";

interface WorkspaceHeaderProps {
  fileName: string;
}

export function WorkspaceHeader({ fileName }: WorkspaceHeaderProps) {
  const viewMode = useClippingWorkspaceStore((s) => s.ui.viewMode);
  const setViewMode = useClippingWorkspaceStore((s) => s.ui.setViewMode);
  const segmentsById = useClippingWorkspaceStore((s) => s.segments.segmentsById);
  const selectedSpeaker = useClippingWorkspaceStore((s) => s.segments.selectedSpeaker);
  const selectSpeaker = useClippingWorkspaceStore((s) => s.segments.selectSpeaker);
  const speakerCollections = useClippingWorkspaceStore(
    (s) => s.segments.speakerCollections,
  );

  const speakers = getUniqueSpeakers(Object.values(segmentsById));
  const speakerColorIndex = selectedSpeaker
    ? speakers.indexOf(selectedSpeaker)
    : -1;

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-2">
      <div className="flex flex-1 items-center gap-3">
        <Link href="/app/clipping">
          <Button size="icon" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-medium text-sm">{fileName}</h1>
      </div>

      <div className="flex items-center rounded-md bg-muted">
        <Select
          value={selectedSpeaker ?? ""}
          onValueChange={(value) => selectSpeaker(value || null)}
        >
          <SelectTrigger className="h-10 max-w-40 rounded-lg bg-muted">
            <SelectValue placeholder="Select speaker">
              {selectedSpeaker && (
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        getSpeakerColor(speakerColorIndex).border,
                    }}
                  />
                  <span className="truncate">
                    {getSpeakerDisplayName(selectedSpeaker, speakerCollections)}
                  </span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {speakers.map((speaker, index) => {
              const color = getSpeakerColor(index);
              return (
                <SelectItem key={speaker} value={speaker}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color.border }}
                    />
                    <span className="truncate">
                      {getSpeakerDisplayName(speaker, speakerCollections)}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Tabs
          value={viewMode}
          onValueChange={(value) => setViewMode(value as ViewMode)}
        >
          <TabsList className="h-10 py-1">
            <TabsTrigger value="table" className="gap-1.5 px-3 text-xs">
              <Table2 className="h-3.5 w-3.5" />
              Table
            </TabsTrigger>
            <TabsTrigger
              value="focus"
              className="gap-1.5 px-3 text-xs"
              disabled
            >
              <Focus className="h-3.5 w-3.5" />
              Focus
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Generate Clips button moved to table toolbar */}
      <div className="flex flex-1 justify-end">
        <Button size="sm" className="h-10" disabled>
          <ScissorsIcon className="mr-1.5 h-3.5 w-3.5" />
          Generate Clips
        </Button>
      </div>
    </div>
  );
}

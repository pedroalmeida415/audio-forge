"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useCallback, useState } from "react";
import { ExcludedSegmentsPanel } from "~/components/clipping/excluded-segments-panel";
import { ReassignSpeakerDialog } from "~/components/clipping/reassign-speaker-dialog";
import { SpeakerGroupCard } from "~/components/clipping/speaker-group-card";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { UseSpeakerWorkspaceReturn } from "~/hooks/use-speaker-workspace";
import type { DiarizationSegment } from "~/server/db/schema";

type SpeakerWorkspaceProps = {
  workspace: UseSpeakerWorkspaceReturn;
  onCreateCollection: (name: string, projectId: string) => Promise<{
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  }>;
  isCreatingCollection: boolean;
};

export function SpeakerWorkspace({
  workspace,
  onCreateCollection,
  isCreatingCollection,
}: SpeakerWorkspaceProps) {
  const {
    speakerGroups,
    speakerOrder,
    speakerStates,
    setSpeakerCollection,
    toggleSpeakerExpanded,
    expandAllSpeakers,
    collapseAllSpeakers,
    excludedSegmentIds,
    excludeSegment,
    restoreSegment,
    restoreAllExcluded,
    getExcludedSegmentsList,
    activeSegmentId,
    setActiveSegmentId,
    reassignSegmentSpeaker,
    isReassigning,
  } = workspace;

  // State for reassign dialog
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [segmentToReassign, setSegmentToReassign] =
    useState<DiarizationSegment | null>(null);

  const handleOpenReassignDialog = useCallback(
    (segmentId: string) => {
      // Find the segment across all groups
      for (const segments of speakerGroups.values()) {
        const segment = segments.find((s) => s.id === segmentId);
        if (segment) {
          setSegmentToReassign(segment);
          setReassignDialogOpen(true);
          break;
        }
      }
    },
    [speakerGroups]
  );

  const excludedSegments = getExcludedSegmentsList();

  // Check if all groups are expanded or collapsed
  const allExpanded = speakerOrder.every((speaker) => {
    const state = speakerStates.get(speaker);
    return state?.isExpanded ?? true;
  });

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Header with expand/collapse all */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            {speakerOrder.length} speaker{speakerOrder.length !== 1 && "s"}{" "}
            identified
          </div>
          <Button
            className="h-7 text-xs"
            onClick={allExpanded ? collapseAllSpeakers : expandAllSpeakers}
            size="sm"
            variant="ghost"
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="mr-1.5 h-3 w-3" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronsUpDown className="mr-1.5 h-3 w-3" />
                Expand All
              </>
            )}
          </Button>
        </div>

        {/* Speaker groups */}
        <div className="flex-1 space-y-3 overflow-y-auto">
          {speakerOrder.map((speaker, index) => {
            const segments = speakerGroups.get(speaker) ?? [];
            const state = speakerStates.get(speaker);

            // Skip speakers with no visible segments
            if (segments.length === 0) {
              return null;
            }

            return (
              <SpeakerGroupCard
                activeSegmentId={activeSegmentId}
                collectionId={state?.collectionId ?? null}
                collectionName={state?.collectionName ?? null}
                isCreatingCollection={isCreatingCollection}
                isExpanded={state?.isExpanded ?? true}
                key={speaker}
                onCreateCollection={onCreateCollection}
                onSegmentExclude={excludeSegment}
                onSegmentReassign={handleOpenReassignDialog}
                onSegmentSelect={setActiveSegmentId}
                onSetCollection={(collectionId, collectionName, projectId, projectName) =>
                  setSpeakerCollection(
                    speaker,
                    collectionId,
                    collectionName,
                    projectId,
                    projectName
                  )
                }
                onToggleExpanded={() => toggleSpeakerExpanded(speaker)}
                projectName={state?.projectName ?? null}
                segments={segments}
                speaker={speaker}
                speakerIndex={index}
              />
            );
          })}
        </div>

        {/* Excluded segments panel */}
        {excludedSegments.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <ExcludedSegmentsPanel
              excludedSegments={excludedSegments}
              onRestore={restoreSegment}
              onRestoreAll={restoreAllExcluded}
            />
          </div>
        )}

        {/* Reassign dialog */}
        <ReassignSpeakerDialog
          existingSpeakers={speakerOrder}
          isReassigning={isReassigning}
          onOpenChange={setReassignDialogOpen}
          onReassign={reassignSegmentSpeaker}
          open={reassignDialogOpen}
          segment={segmentToReassign}
        />
      </div>
    </TooltipProvider>
  );
}

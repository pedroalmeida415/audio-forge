"use client";

import { useValue } from "@legendapp/state/react";
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useClippingStore } from "~/features/clipping/context/store.context";
import type { SpeakerWithSource } from "~/server/db/schema";
import { api } from "~/trpc/react";
import { SegmentsTable } from "./segments-table";

/**
 * Table view container with collapsible speakers sidebar, speaker header, and segments table.
 *
 * Auto-selects the first speaker on mount if none is selected.
 * Shows an empty state only when there are no speakers at all.
 */
export function TableView() {
  const $store = useClippingStore();
  const selectedSpeakerId = useValue($store.selectedSpeakerId);
  const speakers = useValue($store.speakers);
  const sessionId = useValue($store.sessionId);
  const projectId = useValue($store.projectId);

  const [isExpanded, setIsExpanded] = useState(false);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Group speakers by source
  const { projectSpeakers, localSpeakers } = useMemo(() => {
    const project: SpeakerWithSource[] = [];
    const local: SpeakerWithSource[] = [];
    for (const speaker of speakers) {
      if (speaker.source === "local") {
        local.push(speaker);
      } else {
        project.push(speaker);
      }
    }
    return { projectSpeakers: project, localSpeakers: local };
  }, [speakers]);

  const createSpeakerMutation = api.clippingSession.createSpeaker.useMutation();
  const updateSpeakerMutation = api.clippingSession.updateSpeaker.useMutation();
  const updateLocalSpeakerMutation =
    api.clippingSession.updateLocalSpeaker.useMutation();
  const deleteSpeakerMutation =
    api.clippingSession.deleteSpeakerFromSession.useMutation();

  // Auto-select first speaker on mount if none selected
  useEffect(() => {
    if (!selectedSpeakerId && speakers.length > 0) {
      const firstSpeaker = speakers[0];
      if (firstSpeaker) {
        $store.selectSpeaker(firstSpeaker.id);
      }
    }
  }, [selectedSpeakerId, speakers, $store]);

  const handleAddSpeaker = () => {
    createSpeakerMutation.mutate({
      projectId,
      name: `Speaker ${speakers.length + 1}`,
    });
  };

  const handleStartEdit = (speaker: SpeakerWithSource) => {
    setEditingSpeakerId(speaker.id);
    setEditValue(speaker.name);
  };

  const handleConfirmEdit = () => {
    if (editingSpeakerId && editValue.trim()) {
      // Find the speaker to determine source
      const speaker = speakers.find((s) => s.id === editingSpeakerId);
      if (speaker?.source === "local") {
        updateLocalSpeakerMutation.mutate({
          sessionId,
          speakerId: editingSpeakerId,
          name: editValue.trim(),
        });
      } else {
        updateSpeakerMutation.mutate({
          speakerId: editingSpeakerId,
          name: editValue.trim(),
        });
      }
    }
    setEditingSpeakerId(null);
  };

  // Delete only works for local speakers
  const handleDeleteSpeaker = (speakerId: string) => {
    deleteSpeakerMutation.mutate({ sessionId, speakerId });
  };

  // Empty state when no speakers exist at all
  if (speakers.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AudioWaveform className="h-10 w-10 opacity-50" />
        <div className="text-center">
          <p className="text-sm">No speakers yet</p>
          <p className="text-muted-foreground/70 text-xs">
            Run diarization or create segments manually
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left sidebar: Collapsible speaker list */}
      <aside
        className={`flex shrink-0 flex-col border-r bg-muted/30 transition-all duration-200 ease-in-out ${
          isExpanded ? "w-52" : "w-14"
        }`}
      >
        {/* Speaker list */}
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto py-2">
          {/* Project Speakers Section */}
          {projectSpeakers.length > 0 && (
            <>
              {isExpanded && (
                <div className="mb-1 px-3 pt-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Project
                </div>
              )}
              {projectSpeakers.map((speaker) => (
                <SpeakerItem
                  key={speaker.id}
                  speaker={speaker}
                  isSelected={selectedSpeakerId === speaker.id}
                  isEditing={editingSpeakerId === speaker.id}
                  isExpanded={isExpanded}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onSelect={() => $store.selectSpeaker(speaker.id)}
                  onStartEdit={() => handleStartEdit(speaker)}
                  onConfirmEdit={handleConfirmEdit}
                  onCancelEdit={() => setEditingSpeakerId(null)}
                  onDelete={undefined} // Project speakers cannot be deleted
                />
              ))}
            </>
          )}

          {/* Local Speakers Section */}
          {localSpeakers.length > 0 && (
            <>
              {isExpanded && (
                <div className="mb-1 mt-2 border-t px-3 pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Local
                </div>
              )}
              {!isExpanded && projectSpeakers.length > 0 && (
                <div className="mx-auto my-1 h-px w-6 bg-border" />
              )}
              {localSpeakers.map((speaker) => (
                <SpeakerItem
                  key={speaker.id}
                  speaker={speaker}
                  isSelected={selectedSpeakerId === speaker.id}
                  isEditing={editingSpeakerId === speaker.id}
                  isExpanded={isExpanded}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onSelect={() => $store.selectSpeaker(speaker.id)}
                  onStartEdit={() => handleStartEdit(speaker)}
                  onConfirmEdit={handleConfirmEdit}
                  onCancelEdit={() => setEditingSpeakerId(null)}
                  onDelete={() => handleDeleteSpeaker(speaker.id)}
                />
              ))}
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="flex flex-col gap-1 border-t p-2">
          {/* Add speaker button */}
          {isExpanded ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleAddSpeaker}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Speaker
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={handleAddSpeaker}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Add Speaker</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Expand/Collapse button */}
          <Button
            variant="ghost"
            size="sm"
            className={isExpanded ? "w-full justify-start" : "mx-auto h-9 w-9"}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Collapse
              </>
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SegmentsTable />
      </div>
    </div>
  );
}

/**
 * Individual speaker item in the sidebar.
 * Renders differently based on expanded/collapsed state and source type.
 */
function SpeakerItem({
  speaker,
  isSelected,
  isEditing,
  isExpanded,
  editValue,
  setEditValue,
  onSelect,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onDelete,
}: {
  speaker: SpeakerWithSource;
  isSelected: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  editValue: string;
  setEditValue: (value: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (() => void) | undefined; // undefined means delete is not allowed
}) {
  const initial = speaker.name.charAt(0).toUpperCase();

  return (
    <div
      className={`group flex items-center rounded-lg transition-colors ${
        isExpanded ? "mx-2 gap-2" : "mx-auto"
      } ${
        isSelected
          ? "bg-primary/10 ring-2 ring-primary ring-inset"
          : "hover:bg-muted"
      }`}
    >
      {/* Speaker button - wrapped in tooltip when collapsed */}
      {isExpanded ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-2 p-1.5"
        >
          {/* Avatar */}
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs ${
              speaker.source === "local" ? "ring-1 ring-dashed ring-white/30" : ""
            }`}
            style={{ backgroundColor: speaker.color }}
          >
            {initial}
          </div>

          {/* Name */}
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onConfirmEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
              autoFocus
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {speaker.name}
            </span>
          )}
        </button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSelect}
              className="flex items-center gap-2 p-1.5"
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs ${
                  speaker.source === "local" ? "ring-1 ring-dashed ring-white/30" : ""
                }`}
                style={{ backgroundColor: speaker.color }}
              >
                {initial}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{speaker.name}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Actions (when expanded, visible on hover via CSS) */}
      {isExpanded && !isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

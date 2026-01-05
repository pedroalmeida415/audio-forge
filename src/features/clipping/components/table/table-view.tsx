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
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useClippingStore } from "~/features/clipping/context/store.context";
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
  const speakerColors = useValue($store.speakerColors);
  const sessionId = useValue($store.sessionId);
  const projectId = useValue($store.projectId);

  const [isExpanded, setIsExpanded] = useState(false);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const createSpeakerMutation = api.clippingSession.createSpeaker.useMutation();
  const updateSpeakerMutation = api.clippingSession.updateSpeaker.useMutation();
  const deleteSpeakerMutation = api.clippingSession.deleteSpeaker.useMutation();

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

  const handleStartEdit = (speaker: { id: string; name: string }) => {
    setEditingSpeakerId(speaker.id);
    setEditValue(speaker.name);
  };

  const handleConfirmEdit = () => {
    if (editingSpeakerId && editValue.trim()) {
      updateSpeakerMutation.mutate({
        speakerId: editingSpeakerId,
        name: editValue.trim(),
      });
    }
    setEditingSpeakerId(null);
  };

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
          {speakers.map((speaker) => {
            const initial = speaker.name.charAt(0).toUpperCase();
            const isSelected = selectedSpeakerId === speaker.id;
            const isEditing = editingSpeakerId === speaker.id;

            return (
              <div
                key={speaker.id}
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
                    onClick={() => $store.selectSpeaker(speaker.id)}
                    className="flex flex-1 items-center gap-2 p-1.5"
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs"
                      style={{ backgroundColor: speakerColors[speaker.id] }}
                    >
                      {initial}
                    </div>

                    {/* Name */}
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleConfirmEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleConfirmEdit();
                          if (e.key === "Escape") setEditingSpeakerId(null);
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
                        onClick={() => $store.selectSpeaker(speaker.id)}
                        className="flex items-center gap-2 p-1.5"
                      >
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs"
                          style={{ backgroundColor: speakerColors[speaker.id] }}
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
                        handleStartEdit(speaker);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSpeaker(speaker.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
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

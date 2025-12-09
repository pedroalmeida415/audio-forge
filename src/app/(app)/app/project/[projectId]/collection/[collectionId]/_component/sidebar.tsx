"use client";

import {
  AudioLines,
  Gauge,
  MousePointerClick,
  Trash2,
  TrendingUp,
  Users,
  Volume2,
  Wand2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import type { ClipWithMockedFields } from "../_hooks/use-collection-state";

type SidebarProps = {
  activeClip: ClipWithMockedFields | null;
  selectedClips: ClipWithMockedFields[];
  onTranscriptionChange: (clipId: string, text: string) => void;
  onAutoTranscribe: (clipId: string) => void;
  onProcess: (clipIds: string[], option: ProcessingOption) => void;
  onDelete: (clipIds: string[]) => void;
};

type ProcessingOption =
  | "denoise"
  | "removeOverlapping"
  | "upsample"
  | "normalize"
  | "calculateMos";

const PROCESSING_OPTIONS: {
  id: ProcessingOption;
  label: string;
  icon: typeof AudioLines;
  bulkApplicable: boolean;
}[] = [
  { id: "denoise", label: "Denoise", icon: AudioLines, bulkApplicable: true },
  {
    id: "removeOverlapping",
    label: "Remove overlapping voices",
    icon: Users,
    bulkApplicable: true,
  },
  { id: "upsample", label: "Upsample", icon: TrendingUp, bulkApplicable: true },
  { id: "normalize", label: "Normalize", icon: Volume2, bulkApplicable: true },
  {
    id: "calculateMos",
    label: "Calculate MOS score",
    icon: Gauge,
    bulkApplicable: true,
  },
];

export function Sidebar({
  activeClip,
  selectedClips,
  onTranscriptionChange,
  onAutoTranscribe,
  onProcess,
  onDelete,
}: SidebarProps) {
  const hasSelection = selectedClips.length > 0;
  const targetClips = hasSelection
    ? selectedClips
    : activeClip
      ? [activeClip]
      : [];

  if (targetClips.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 border-l p-6 text-muted-foreground">
        <MousePointerClick className="size-12 opacity-50" />
        <div className="text-center">
          <p className="font-medium">No clip selected</p>
          <p className="text-sm">
            Click on a clip to view and edit its details
          </p>
        </div>
      </div>
    );
  }

  const targetClipIds = targetClips.map((c) => c.id);
  // Selection mode: any clips selected via checkbox (transcription disabled)
  // Active mode: single clip clicked (transcription enabled)
  const isSelectionMode = hasSelection;
  const singleActiveClip = !hasSelection && activeClip ? activeClip : null;

  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">
              {isSelectionMode
                ? `${selectedClips.length} clip${selectedClips.length > 1 ? "s" : ""} selected`
                : "Clip Details"}
            </h3>
            {singleActiveClip && (
              <p className="mt-1 text-muted-foreground text-xs">
                MOS: {singleActiveClip.mosScore?.toFixed(1) ?? "--"} | Duration:{" "}
                {singleActiveClip.duration}s
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Processing
            </h4>
            <div className="space-y-2">
              {PROCESSING_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => onProcess(targetClipIds, option.id)}
                >
                  <option.icon className="size-4" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Transcription
            </h4>
            {isSelectionMode ? (
              <p className="text-muted-foreground text-sm">
                Click a clip to edit its transcription.
              </p>
            ) : singleActiveClip ? (
              <div className="space-y-2">
                {singleActiveClip.transcript ? (
                  <Textarea
                    value={singleActiveClip.transcript}
                    onChange={(e) =>
                      onTranscriptionChange(singleActiveClip.id, e.target.value)
                    }
                    placeholder="Enter transcription..."
                    rows={4}
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                      No transcription available.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => onAutoTranscribe(singleActiveClip.id)}
                    >
                      <Wand2 className="size-4" />
                      Auto-transcribe
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-2"
          onClick={() => onDelete(targetClipIds)}
        >
          <Trash2 className="size-4" />
          Delete {selectedClips.length > 1 ? `${selectedClips.length} clips` : "clip"}
        </Button>
      </div>
    </div>
  );
}

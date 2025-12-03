"use client";

import {
  AudioLines,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  Music,
  Sparkles,
  Square,
  TrendingUp,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { ProcessingType } from "~/server/db/schema";

type BatchProcessingToolbarProps = {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchProcess: (
    processingType: ProcessingType,
    params: Record<string, number>
  ) => void;
  onBatchTranscribe: () => void;
  onBatchCalculateMOS: () => void;
  isBatchProcessing?: boolean;
  isBatchTranscribing?: boolean;
  isBatchCalculatingMOS?: boolean;
  className?: string;
};

const BATCH_PROCESSING_OPTIONS: Array<{
  type: ProcessingType;
  label: string;
  icon: typeof Sparkles;
  defaultParams: Record<string, number>;
}> = [
  {
    type: "denoise",
    label: "Denoise All",
    icon: Sparkles,
    defaultParams: { noiseReduction: 0.5 },
  },
  {
    type: "remove_bg_music",
    label: "Remove BG Music",
    icon: Music,
    defaultParams: { aggressiveness: 0.5 },
  },
  {
    type: "remove_overlap",
    label: "Remove Overlap",
    icon: AudioLines,
    defaultParams: { aggressiveness: 0.5 },
  },
  {
    type: "normalize",
    label: "Normalize All",
    icon: Volume2,
    defaultParams: { targetLufs: -14 },
  },
  {
    type: "upsample",
    label: "Upsample to 48kHz",
    icon: TrendingUp,
    defaultParams: { targetSampleRate: 48000 },
  },
];

export function BatchProcessingToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBatchProcess,
  onBatchTranscribe,
  onBatchCalculateMOS,
  isBatchProcessing = false,
  isBatchTranscribing = false,
  isBatchCalculatingMOS = false,
  className,
}: BatchProcessingToolbarProps) {
  const hasSelection = selectedCount > 0;
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const isAnyProcessing =
    isBatchProcessing || isBatchTranscribing || isBatchCalculatingMOS;

  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3",
        className
      )}
    >
      {/* Selection controls */}
      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          size="sm"
          variant="outline"
        >
          {allSelected ? (
            <>
              <X className="h-3.5 w-3.5" />
              Deselect All
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Select All
            </>
          )}
        </Button>

        <span className="text-muted-foreground text-sm">
          {selectedCount} of {totalCount} selected
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Batch actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Processing dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="gap-1.5"
              disabled={!hasSelection || isAnyProcessing}
              size="sm"
              variant="outline"
            >
              {isBatchProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Process Selected
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {BATCH_PROCESSING_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenuItem
                  key={option.type}
                  onClick={() => onBatchProcess(option.type, option.defaultParams)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Batch transcribe */}
        <Button
          className="gap-1.5"
          disabled={!hasSelection || isAnyProcessing}
          onClick={onBatchTranscribe}
          size="sm"
          variant="outline"
        >
          {isBatchTranscribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
          Transcribe Selected
        </Button>

        {/* Batch MOS calculation */}
        <Button
          className="gap-1.5"
          disabled={!hasSelection || isAnyProcessing}
          onClick={onBatchCalculateMOS}
          size="sm"
          variant="outline"
        >
          {isBatchCalculatingMOS ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
          Calculate MOS
        </Button>
      </div>

      {/* Processing status */}
      {isAnyProcessing && (
        <div className="ml-auto flex items-center gap-2 text-primary text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {isBatchProcessing && "Processing..."}
            {isBatchTranscribing && "Transcribing..."}
            {isBatchCalculatingMOS && "Calculating MOS..."}
          </span>
        </div>
      )}
    </div>
  );
}

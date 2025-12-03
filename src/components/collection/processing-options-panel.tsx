"use client";

import {
  AudioLines,
  Loader2,
  Music,
  Sparkles,
  TrendingUp,
  Volume2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import type { ProcessingType } from "~/server/db/schema";

type ProcessingOption = {
  type: ProcessingType;
  label: string;
  description: string;
  icon: typeof Sparkles;
  params?: Array<{
    key: string;
    label: string;
    type: "slider" | "select";
    min?: number;
    max?: number;
    step?: number;
    default: number;
    options?: Array<{ value: string; label: string }>;
  }>;
};

const PROCESSING_OPTIONS: ProcessingOption[] = [
  {
    type: "denoise",
    label: "Denoise",
    description: "Remove background noise from the audio",
    icon: Sparkles,
    params: [
      {
        key: "noiseReduction",
        label: "Noise Reduction",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
      },
    ],
  },
  {
    type: "remove_bg_music",
    label: "Remove BG Music",
    description: "Filter out background music to isolate speech",
    icon: Music,
    params: [
      {
        key: "aggressiveness",
        label: "Aggressiveness",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
      },
    ],
  },
  {
    type: "remove_overlap",
    label: "Remove Overlap",
    description: "Reduce overlapping voices and crosstalk",
    icon: AudioLines,
    params: [
      {
        key: "aggressiveness",
        label: "Aggressiveness",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
      },
    ],
  },
  {
    type: "normalize",
    label: "Normalize",
    description: "Adjust volume levels to a consistent target",
    icon: Volume2,
    params: [
      {
        key: "targetLufs",
        label: "Target LUFS",
        type: "select",
        default: -14,
        options: [
          { value: "-23", label: "-23 LUFS (Broadcast)" },
          { value: "-16", label: "-16 LUFS (Podcast)" },
          { value: "-14", label: "-14 LUFS (Streaming)" },
          { value: "-11", label: "-11 LUFS (Loud)" },
        ],
      },
    ],
  },
  {
    type: "upsample",
    label: "Upsample",
    description: "Increase sample rate for higher quality",
    icon: TrendingUp,
    params: [
      {
        key: "targetSampleRate",
        label: "Target Sample Rate",
        type: "select",
        default: 48000,
        options: [
          { value: "44100", label: "44.1 kHz (CD)" },
          { value: "48000", label: "48 kHz (Standard)" },
          { value: "96000", label: "96 kHz (Hi-Res)" },
        ],
      },
    ],
  },
];

type ProcessingOptionsPanelProps = {
  onProcess: (
    processingType: ProcessingType,
    params: Record<string, number>
  ) => void;
  isProcessing?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ProcessingOptionsPanel({
  onProcess,
  isProcessing = false,
  disabled = false,
  className,
}: ProcessingOptionsPanelProps) {
  const [selectedType, setSelectedType] = useState<ProcessingType | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});

  const selectedOption = PROCESSING_OPTIONS.find(
    (opt) => opt.type === selectedType
  );

  function handleSelectOption(type: ProcessingType) {
    if (selectedType === type) {
      setSelectedType(null);
      setParams({});
      return;
    }

    setSelectedType(type);
    // Initialize default params
    const option = PROCESSING_OPTIONS.find((opt) => opt.type === type);
    if (option?.params) {
      const defaultParams: Record<string, number> = {};
      for (const param of option.params) {
        defaultParams[param.key] = param.default;
      }
      setParams(defaultParams);
    } else {
      setParams({});
    }
  }

  function handleParamChange(key: string, value: number) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleProcess() {
    if (!selectedType) return;
    onProcess(selectedType, params);
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Processing type buttons */}
      <div className="flex flex-wrap gap-2">
        {PROCESSING_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedType === option.type;

          return (
            <Button
              className={cn(
                "gap-1.5",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
              disabled={disabled || isProcessing}
              key={option.type}
              onClick={() => handleSelectOption(option.type)}
              size="sm"
              title={option.description}
              variant={isSelected ? "default" : "outline"}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </Button>
          );
        })}
      </div>

      {/* Parameter controls */}
      {selectedOption?.params && (
        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
          <p className="text-muted-foreground text-xs">
            {selectedOption.description}
          </p>

          {selectedOption.params.map((param) => (
            <div className="space-y-2" key={param.key}>
              <div className="flex items-center justify-between">
                <Label className="text-sm">{param.label}</Label>
                {param.type === "slider" && (
                  <span className="font-mono text-muted-foreground text-xs">
                    {(params[param.key] ?? param.default).toFixed(1)}
                  </span>
                )}
              </div>

              {param.type === "slider" && (
                <Slider
                  defaultValue={[param.default]}
                  disabled={disabled || isProcessing}
                  max={param.max}
                  min={param.min}
                  onValueChange={([value]) =>
                    handleParamChange(param.key, value ?? param.default)
                  }
                  step={param.step}
                  value={[params[param.key] ?? param.default]}
                />
              )}

              {param.type === "select" && param.options && (
                <Select
                  defaultValue={String(param.default)}
                  disabled={disabled || isProcessing}
                  onValueChange={(value) =>
                    handleParamChange(param.key, Number(value))
                  }
                  value={String(params[param.key] ?? param.default)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {param.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <Button
            className="mt-2 w-full"
            disabled={disabled || isProcessing}
            onClick={handleProcess}
            size="sm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Apply {selectedOption.label}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for batch processing toolbar
 */
type ProcessingQuickSelectProps = {
  onSelect: (
    processingType: ProcessingType,
    params: Record<string, number>
  ) => void;
  disabled?: boolean;
  className?: string;
};

export function ProcessingQuickSelect({
  onSelect,
  disabled = false,
  className,
}: ProcessingQuickSelectProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {PROCESSING_OPTIONS.map((option) => {
        const Icon = option.icon;
        // Use default params for quick select
        const defaultParams: Record<string, number> = {};
        if (option.params) {
          for (const param of option.params) {
            defaultParams[param.key] = param.default;
          }
        }

        return (
          <Button
            className="gap-1.5"
            disabled={disabled}
            key={option.type}
            onClick={() => onSelect(option.type, defaultParams)}
            size="sm"
            title={option.description}
            variant="outline"
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

"use client";

import {
  AlertCircle,
  AudioLines,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Save,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MOSBadge, MOSComparison } from "~/components/collection/mos-badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Slider } from "~/components/ui/slider";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type { ProcessingStatus, ProcessingType } from "~/server/db/schema";

type ProcessedClipInfo = {
  id: string;
  processingType: ProcessingType;
  processingStatus: ProcessingStatus;
  processingParams?: Record<string, unknown> | null;
  mosScore?: number | null;
  durationSeconds?: number | null;
  sampleRate?: number | null;
  format?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
};

type ClipData = {
  id: string;
  durationSeconds: number;
  extractedStartTime: number;
  extractedEndTime: number;
  format: string;
  transcript?: string | null;
  transcriptMetadata?: {
    language?: string;
    provider?: string;
    confidence?: number;
  } | null;
  mosScore?: number | null;
  createdAt: Date;
  sourceSpeakerLabel: string | null;
  sourceFilename: string | null;
  processedClips?: ProcessedClipInfo[];
};

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
        default: 48_000,
        options: [
          { value: "44100", label: "44.1 kHz (CD)" },
          { value: "48000", label: "48 kHz (Standard)" },
          { value: "96000", label: "96 kHz (Hi-Res)" },
        ],
      },
    ],
  },
];

const PROCESSING_TYPE_INFO: Record<ProcessingType, { label: string; icon: typeof Sparkles }> = {
  denoise: { label: "Denoise", icon: Sparkles },
  remove_bg_music: { label: "Remove BG Music", icon: Music },
  remove_overlap: { label: "Remove Overlap", icon: AudioLines },
  normalize: { label: "Normalize", icon: Volume2 },
  upsample: { label: "Upsample", icon: TrendingUp },
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ClipEditorSidebarProps = {
  selectedClips: ClipData[];
  audioUrl?: string;
  getProcessedClipUrl?: (processedClipId: string) => string | undefined;
  hasClips?: boolean;
  onClose: () => void;
  onDelete: (clipId: string) => void;
  onProcess: (clipId: string, processingType: ProcessingType, params: Record<string, number>) => void;
  onBatchProcess: (processingType: ProcessingType, params: Record<string, number>) => void;
  onSaveTranscript: (clipId: string, transcript: string) => void;
  onAutoTranscribe: (clipId: string) => void;
  onBatchTranscribe: () => void;
  onClearTranscript: (clipId: string) => void;
  onCalculateMOS: (clipId: string) => void;
  onBatchCalculateMOS: () => void;
  onDeleteProcessed: (processedClipId: string) => void;
  onPlayProcessed?: (processedClipId: string) => void;
  onDownloadProcessed?: (processedClipId: string) => void;
  isDeleting?: boolean;
  isProcessing?: boolean;
  isBatchProcessing?: boolean;
  isSavingTranscript?: boolean;
  isTranscribing?: boolean;
  isBatchTranscribing?: boolean;
  isCalculatingMOS?: boolean;
  isBatchCalculatingMOS?: boolean;
  isDeletingProcessed?: string | null;
  className?: string;
};

export function ClipEditorSidebar({
  selectedClips,
  audioUrl,
  getProcessedClipUrl,
  hasClips = false,
  onClose,
  onDelete,
  onProcess,
  onBatchProcess,
  onSaveTranscript,
  onAutoTranscribe,
  onBatchTranscribe,
  onClearTranscript,
  onCalculateMOS,
  onBatchCalculateMOS,
  onDeleteProcessed,
  onPlayProcessed,
  onDownloadProcessed,
  isDeleting = false,
  isProcessing = false,
  isBatchProcessing = false,
  isSavingTranscript = false,
  isTranscribing = false,
  isBatchTranscribing = false,
  isCalculatingMOS = false,
  isBatchCalculatingMOS = false,
  isDeletingProcessed = null,
  className,
}: ClipEditorSidebarProps) {
  const isMultiSelect = selectedClips.length > 1;
  const singleClip = selectedClips.length === 1 ? selectedClips[0] : null;

  // Processing state
  const [selectedProcessingType, setSelectedProcessingType] = useState<ProcessingType | null>(null);
  const [processingParams, setProcessingParams] = useState<Record<string, number>>({});

  // Transcription state (single clip only)
  const [transcript, setTranscript] = useState(singleClip?.transcript ?? "");
  const [isDirty, setIsDirty] = useState(false);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyPlayingProcessedId, setCurrentlyPlayingProcessedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Reset state when selection changes
  useEffect(() => {
    setSelectedProcessingType(null);
    setProcessingParams({});
    if (singleClip) {
      setTranscript(singleClip.transcript ?? "");
      setIsDirty(false);
    }
  }, [singleClip?.id, selectedClips.length]);

  const selectedOption = PROCESSING_OPTIONS.find(
    (opt) => opt.type === selectedProcessingType
  );

  function handleSelectProcessingType(type: ProcessingType) {
    if (selectedProcessingType === type) {
      setSelectedProcessingType(null);
      setProcessingParams({});
      return;
    }

    setSelectedProcessingType(type);
    const option = PROCESSING_OPTIONS.find((opt) => opt.type === type);
    if (option?.params) {
      const defaultParams: Record<string, number> = {};
      for (const param of option.params) {
        defaultParams[param.key] = param.default;
      }
      setProcessingParams(defaultParams);
    } else {
      setProcessingParams({});
    }
  }

  function handleParamChange(key: string, value: number) {
    setProcessingParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleApplyProcessing() {
    if (!selectedProcessingType) return;

    if (isMultiSelect) {
      onBatchProcess(selectedProcessingType, processingParams);
    } else if (singleClip) {
      onProcess(singleClip.id, selectedProcessingType, processingParams);
    }
  }

  function handleTranscriptChange(value: string) {
    setTranscript(value);
    setIsDirty(value !== (singleClip?.transcript ?? ""));
  }

  function handleSaveTranscript() {
    if (singleClip) {
      onSaveTranscript(singleClip.id, transcript);
      setIsDirty(false);
    }
  }

  function handlePlayPause() {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function handlePlayProcessed(processedClipId: string) {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (currentlyPlayingProcessedId === processedClipId) {
      setCurrentlyPlayingProcessedId(null);
    } else {
      setCurrentlyPlayingProcessedId(processedClipId);
    }

    onPlayProcessed?.(processedClipId);
  }

  function handleDownloadProcessed(processedClipId: string) {
    const url = getProcessedClipUrl?.(processedClipId);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `processed-${processedClipId}.wav`;
      a.click();
    }
    onDownloadProcessed?.(processedClipId);
  }

  const isAnyProcessing = isProcessing || isBatchProcessing;
  const isAnyTranscribing = isTranscribing || isBatchTranscribing;
  const isAnyCalculatingMOS = isCalculatingMOS || isBatchCalculatingMOS;
  const hasSelection = selectedClips.length > 0;

  return (
    <div
      className={cn(
        "flex h-full flex-col border-l bg-background",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">
            {isMultiSelect
              ? `${selectedClips.length} Clips Selected`
              : singleClip?.sourceSpeakerLabel ?? "Clip Editor"}
          </h2>
        </div>
        {hasSelection && (
          <Button onClick={onClose} size="icon-sm" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {/* Empty state when no clips selected */}
        {!hasSelection && (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 font-medium">
              {hasClips ? "Select a clip to edit" : "No clips yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[250px]">
              {hasClips
                ? "Click on a clip from the list to view and edit its details, transcription, and processing options."
                : "Extract clips from diarization segments in the clipping workspace to get started."}
            </p>
          </div>
        )}

        {hasSelection && (
        <div className="space-y-6 p-4">
          {/* Single clip details */}
          {singleClip && (
            <>
              {/* Audio player */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Original Audio</h3>
                  <MOSBadge score={singleClip.mosScore} size="sm" />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    className="shrink-0"
                    disabled={!audioUrl}
                    onClick={handlePlayPause}
                    size="icon"
                    variant="outline"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5" />
                    )}
                  </Button>

                  {audioUrl && (
                    // biome-ignore lint/a11y/useMediaCaption: Audio clips are speech samples
                    <audio
                      className="hidden"
                      onEnded={() => setIsPlaying(false)}
                      onPause={() => setIsPlaying(false)}
                      onPlay={() => setIsPlaying(true)}
                      ref={audioRef}
                      src={audioUrl}
                    />
                  )}

                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full bg-primary transition-all",
                          isPlaying && "animate-pulse"
                        )}
                        style={{ width: isPlaying ? "100%" : "0%" }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDuration(singleClip.durationSeconds)}</span>
                      <span className="uppercase">{singleClip.format}</span>
                    </div>
                  </div>

                  {audioUrl && (
                    <Button asChild size="icon-sm" variant="ghost">
                      <a download={`clip-${singleClip.id}.${singleClip.format}`} href={audioUrl}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>

                {/* Clip metadata */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(singleClip.extractedStartTime)} - {formatTimestamp(singleClip.extractedEndTime)}
                  </span>
                  <span>•</span>
                  <span>{singleClip.sourceFilename}</span>
                </div>

                {/* Calculate MOS button if not calculated */}
                {singleClip.mosScore === null && (
                  <Button
                    className="w-full"
                    disabled={isCalculatingMOS}
                    onClick={() => onCalculateMOS(singleClip.id)}
                    size="sm"
                    variant="outline"
                  >
                    {isCalculatingMOS ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="mr-2 h-4 w-4" />
                    )}
                    Calculate Quality Score
                  </Button>
                )}
              </section>

              <Separator />
            </>
          )}

          {/* Multi-select summary */}
          {isMultiSelect && (
            <>
              <section className="space-y-3">
                <h3 className="font-medium text-sm">Selected Clips</h3>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total clips:</span>{" "}
                      <span className="font-medium">{selectedClips.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">With MOS:</span>{" "}
                      <span className="font-medium">
                        {selectedClips.filter((c) => c.mosScore !== null).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Transcribed:</span>{" "}
                      <span className="font-medium">
                        {selectedClips.filter((c) => c.transcript?.trim()).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total duration:</span>{" "}
                      <span className="font-medium">
                        {formatDuration(selectedClips.reduce((sum, c) => sum + c.durationSeconds, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <Separator />
            </>
          )}

          {/* Processing options */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">Audio Processing</h3>
            <p className="text-xs text-muted-foreground">
              {isMultiSelect
                ? `Apply processing to all ${selectedClips.length} selected clips`
                : "Enhance audio quality with processing options"}
            </p>

            {/* Processing type buttons */}
            <div className="grid grid-cols-2 gap-2">
              {PROCESSING_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedProcessingType === option.type;

                return (
                  <Button
                    className={cn(
                      "justify-start gap-2",
                      isSelected && "ring-2 ring-primary"
                    )}
                    disabled={isAnyProcessing}
                    key={option.type}
                    onClick={() => handleSelectProcessingType(option.type)}
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>

            {/* Parameter controls */}
            {selectedOption?.params && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {selectedOption.description}
                </p>

                {selectedOption.params.map((param) => (
                  <div className="space-y-2" key={param.key}>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{param.label}</Label>
                      {param.type === "slider" && (
                        <span className="font-mono text-muted-foreground text-xs">
                          {(processingParams[param.key] ?? param.default).toFixed(1)}
                        </span>
                      )}
                    </div>

                    {param.type === "slider" && (
                      <Slider
                        defaultValue={[param.default]}
                        disabled={isAnyProcessing}
                        max={param.max}
                        min={param.min}
                        onValueChange={([value]) =>
                          handleParamChange(param.key, value ?? param.default)
                        }
                        step={param.step}
                        value={[processingParams[param.key] ?? param.default]}
                      />
                    )}

                    {param.type === "select" && param.options && (
                      <Select
                        defaultValue={String(param.default)}
                        disabled={isAnyProcessing}
                        onValueChange={(value) =>
                          handleParamChange(param.key, Number(value))
                        }
                        value={String(processingParams[param.key] ?? param.default)}
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
                  className="w-full"
                  disabled={isAnyProcessing}
                  onClick={handleApplyProcessing}
                  size="sm"
                >
                  {isAnyProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Apply {selectedOption.label}
                      {isMultiSelect && ` to ${selectedClips.length} clips`}
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>

          <Separator />

          {/* Transcription section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Transcription
              </h3>
              {singleClip?.transcriptMetadata?.provider && (
                <span className="text-xs text-muted-foreground">
                  {singleClip.transcriptMetadata.provider === "manual" ? "Manual" : "Auto"}
                </span>
              )}
            </div>

            {isMultiSelect ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center">
                <Mic className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Transcription editing is only available when a single clip is selected.
                </p>
                <Button
                  className="mt-3"
                  disabled={isAnyTranscribing}
                  onClick={onBatchTranscribe}
                  size="sm"
                  variant="outline"
                >
                  {isBatchTranscribing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Auto-transcribe {selectedClips.length} clips
                </Button>
              </div>
            ) : singleClip ? (
              <div className="space-y-3">
                <Textarea
                  className={cn(
                    "min-h-[100px] resize-y",
                    isDirty && "border-primary/50"
                  )}
                  disabled={isAnyTranscribing}
                  onChange={(e) => handleTranscriptChange(e.target.value)}
                  placeholder="Enter or auto-generate transcription..."
                  value={transcript}
                />

                {singleClip.transcriptMetadata?.confidence !== undefined &&
                  singleClip.transcriptMetadata.confidence > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Confidence: {(singleClip.transcriptMetadata.confidence * 100).toFixed(0)}%
                      </span>
                      {singleClip.transcriptMetadata.language && (
                        <span>
                          Language: {singleClip.transcriptMetadata.language.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                <div className="flex items-center gap-2">
                  {isDirty && (
                    <Button
                      disabled={isSavingTranscript}
                      onClick={handleSaveTranscript}
                      size="sm"
                    >
                      {isSavingTranscript ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  )}

                  {!transcript.trim() && (
                    <Button
                      disabled={isAnyTranscribing}
                      onClick={() => onAutoTranscribe(singleClip.id)}
                      size="sm"
                      variant="outline"
                    >
                      {isTranscribing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      Auto-transcribe
                    </Button>
                  )}

                  {transcript.trim() && (
                    <Button
                      disabled={isAnyTranscribing || isSavingTranscript}
                      onClick={() => onClearTranscript(singleClip.id)}
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {/* Processing history (single clip only) */}
          {singleClip?.processedClips && singleClip.processedClips.length > 0 && (
            <>
              <Separator />

              <section className="space-y-3">
                <h3 className="font-medium text-sm">
                  Processing History ({singleClip.processedClips.length})
                </h3>

                <div className="space-y-2">
                  {singleClip.processedClips.map((processed) => {
                    const typeInfo = PROCESSING_TYPE_INFO[processed.processingType];
                    const Icon = typeInfo.icon;

                    const isCompleted = processed.processingStatus === "completed";
                    const isPending =
                      processed.processingStatus === "pending" ||
                      processed.processingStatus === "processing";
                    const isFailed = processed.processingStatus === "failed";
                    const isProcessedPlaying = currentlyPlayingProcessedId === processed.id;

                    return (
                      <div
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-2",
                          isCompleted && "border-border/50 bg-background",
                          isPending && "border-primary/30 bg-primary/5",
                          isFailed && "border-destructive/30 bg-destructive/5"
                        )}
                        key={processed.id}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                            isCompleted && "bg-muted",
                            isPending && "bg-primary/10",
                            isFailed && "bg-destructive/10"
                          )}
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : isFailed ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{typeInfo.label}</span>
                            {isCompleted &&
                              processed.mosScore !== null &&
                              processed.mosScore !== undefined && (
                                <MOSComparison
                                  originalScore={singleClip.mosScore}
                                  processedScore={processed.mosScore}
                                />
                              )}
                          </div>

                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Clock className="h-3 w-3" />
                            <span>
                              {processed.createdAt.toLocaleDateString()}{" "}
                              {processed.createdAt.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          {isFailed && processed.errorMessage && (
                            <p className="mt-1 truncate text-destructive text-xs">
                              {processed.errorMessage}
                            </p>
                          )}
                        </div>

                        {isCompleted && (
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => handlePlayProcessed(processed.id)}
                              size="icon-sm"
                              variant="ghost"
                            >
                              {isProcessedPlaying ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              onClick={() => handleDownloadProcessed(processed.id)}
                              size="icon-sm"
                              variant="ghost"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              disabled={isDeletingProcessed === processed.id}
                              onClick={() => onDeleteProcessed(processed.id)}
                              size="icon-sm"
                              variant="ghost"
                            >
                              {isDeletingProcessed === processed.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        )}

                        {isFailed && (
                          <Button
                            disabled={isDeletingProcessed === processed.id}
                            onClick={() => onDeleteProcessed(processed.id)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            {isDeletingProcessed === processed.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          <Separator />

          {/* Bulk actions */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">Quick Actions</h3>

            <div className="flex flex-col gap-2">
              {/* Batch MOS calculation */}
              {isMultiSelect && (
                <Button
                  disabled={isAnyCalculatingMOS}
                  onClick={onBatchCalculateMOS}
                  size="sm"
                  variant="outline"
                >
                  {isBatchCalculatingMOS ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  Calculate MOS for {selectedClips.length} clips
                </Button>
              )}

              {/* Delete */}
              {singleClip && (
                <Button
                  className="text-destructive hover:text-destructive"
                  disabled={isDeleting}
                  onClick={() => onDelete(singleClip.id)}
                  size="sm"
                  variant="outline"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Clip
                </Button>
              )}
            </div>
          </section>
        </div>
        )}
      </ScrollArea>
    </div>
  );
}

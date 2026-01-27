"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileAudio,
  Filter,
  Pause,
  Play,
  Plus,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Slider } from "~/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_SEGMENTS = [
  {
    id: "seg-001",
    number: 1,
    sessionName: "Rick.and.Morty.S02E09.1080p.BluRay.x265-RARBG.flac",
    startTime: 7.78,
    endTime: 12.44,
    originalScore: 3.2,
    processedScore: 4.1,
    originalDuration: 4.66,
    processedDuration: 4.66,
    hasClip: true,
    transcription:
      "The final segment [laugh] with some [breath] markers included",
    tags: ["Angry", "Catch phrase", "Overlap"],
    qualityDetails: { mos: 3.8, snr: 22.4, pesq: 3.1, stoi: 0.89 },
  },
  {
    id: "seg-002",
    number: 2,
    sessionName: "Rick.and.Morty.S02E09.1080p.BluRay.x265-RARBG.flac",
    startTime: 15.2,
    endTime: 18.95,
    originalScore: 2.8,
    processedScore: 3.9,
    originalDuration: 3.75,
    processedDuration: 3.75,
    hasClip: true,
    transcription: "Wubba lubba dub dub! [laugh]",
    tags: ["Catch phrase"],
    qualityDetails: { mos: 3.5, snr: 18.2, pesq: 2.9, stoi: 0.82 },
  },
  {
    id: "seg-003",
    number: 3,
    sessionName: "Rick.and.Morty.S02E10.1080p.BluRay.x265-RARBG.flac",
    startTime: 102.5,
    endTime: 108.2,
    originalScore: 4.1,
    processedScore: 4.5,
    originalDuration: 5.7,
    processedDuration: 5.7,
    hasClip: true,
    transcription:
      "I turned myself into a pickle, Morty! [breath] I'm Pickle Rick!",
    tags: ["Excited", "Iconic"],
    qualityDetails: { mos: 4.3, snr: 28.1, pesq: 4.0, stoi: 0.94 },
  },
  {
    id: "seg-004",
    number: 4,
    sessionName: "Rick.and.Morty.S02E10.1080p.BluRay.x265-RARBG.flac",
    startTime: 245.8,
    endTime: 249.1,
    originalScore: 3.5,
    processedScore: null,
    originalDuration: 3.3,
    processedDuration: null,
    hasClip: false,
    transcription: null,
    tags: [],
    qualityDetails: { mos: 3.2, snr: 20.5, pesq: 3.3, stoi: 0.86 },
  },
  {
    id: "seg-005",
    number: 5,
    sessionName: "Rick.and.Morty.S03E01.1080p.BluRay.x265-RARBG.flac",
    startTime: 58.0,
    endTime: 63.8,
    originalScore: 2.1,
    processedScore: 3.2,
    originalDuration: 5.8,
    processedDuration: 5.8,
    hasClip: true,
    transcription:
      "[breath] That's the way the news goes [laugh] Grassss tastes bad!",
    tags: ["Slurred", "Background noise"],
    qualityDetails: { mos: 2.8, snr: 12.3, pesq: 2.2, stoi: 0.71 },
  },
];

const MOCK_SPEAKER = {
  id: "speaker-001",
  name: "Rick Sanchez",
  totalSegments: 5,
  totalDuration: 23.21,
  avgQuality: 3.54,
  durationDistribution: [
    { range: "0-2s", count: 0 },
    { range: "2-4s", count: 2 },
    { range: "4-6s", count: 3 },
    { range: "6-8s", count: 0 },
    { range: "8s+", count: 0 },
  ],
};

const AVAILABLE_TAGS = [
  "Angry",
  "Catch phrase",
  "Overlap",
  "Excited",
  "Iconic",
  "Slurred",
  "Background noise",
  "Whisper",
  "Shout",
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function parseTranscriptionWithBadges(text: string): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part, idx) => {
    const key = `${idx}-${part}`;
    if (part.startsWith("[") && part.endsWith("]")) {
      const label = part.slice(1, -1);
      return (
        <span
          key={key}
          className="mx-0.5 inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500"
        >
          {label}
        </span>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

// =============================================================================
// COMPONENTS
// =============================================================================

// --- Audio Player -----------------------------------------------------------

interface AudioPlayerProps {
  label: string;
  duration: number;
  score: number | null;
  variant: "original" | "processed";
  qualityDetails?: { mos: number; snr: number; pesq: number; stoi: number };
}

function AudioPlayer({
  label,
  duration,
  score,
  variant,
  qualityDetails,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // Simulate playback
  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const scoreColor =
    score === null
      ? "text-zinc-400"
      : score >= 4
        ? "text-emerald-600"
        : score >= 3
          ? "text-zinc-900"
          : "text-amber-600";

  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-lg border px-3 py-2.5",
        variant === "original"
          ? "border-zinc-200 bg-zinc-50"
          : "border-zinc-300 bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-700"
      >
        {isPlaying ? (
          <Pause className="size-3.5" fill="currentColor" />
        ) : (
          <Play className="size-3.5 translate-x-0.5" fill="currentColor" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium text-[11px] text-zinc-500 uppercase tracking-wide">
          {label}
        </span>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              variant === "original" ? "bg-zinc-400" : "bg-zinc-900",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-zinc-400">
          {formatTime(duration * (progress / 100))} / {formatTime(duration)}
        </span>
      </div>

      {score !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex shrink-0 cursor-help items-baseline gap-0.5 font-semibold tabular-nums",
                scoreColor,
              )}
            >
              <span className="text-2xl">{score.toFixed(1)}</span>
            </div>
          </TooltipTrigger>
          {qualityDetails && (
            <TooltipContent className="w-48 p-0" side="top">
              <div className="space-y-1 p-2">
                <div className="mb-2 border-zinc-700 border-b pb-1.5 font-medium text-[11px] uppercase tracking-wide">
                  Quality Metrics
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">MOS</span>
                  <span className="font-mono">
                    {qualityDetails.mos.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">SNR</span>
                  <span className="font-mono">
                    {qualityDetails.snr.toFixed(1)} dB
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">PESQ</span>
                  <span className="font-mono">
                    {qualityDetails.pesq.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">STOI</span>
                  <span className="font-mono">
                    {qualityDetails.stoi.toFixed(2)}
                  </span>
                </div>
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      ) : (
        <span className="text-sm text-zinc-400">--</span>
      )}
    </div>
  );
}

// --- Segment Card -----------------------------------------------------------

interface SegmentCardProps {
  segment: (typeof MOCK_SEGMENTS)[0];
  isSelected: boolean;
  onToggleSelect: () => void;
}

function SegmentCard({
  segment,
  isSelected,
  onToggleSelect,
}: SegmentCardProps) {
  const [startTime, setStartTime] = React.useState(
    formatTime(segment.startTime),
  );
  const [endTime, setEndTime] = React.useState(formatTime(segment.endTime));
  const [isAddingTag, setIsAddingTag] = React.useState(false);

  const scoreDelta =
    segment.processedScore !== null
      ? segment.processedScore - segment.originalScore
      : null;

  return (
    <div
      className={cn(
        "group rounded-lg border bg-white transition-all duration-150",
        isSelected
          ? "border-zinc-400 ring-1 ring-zinc-400/20"
          : "border-zinc-200 hover:border-zinc-300",
      )}
    >
      {/* Main content */}
      <div className="flex gap-4 p-4">
        {/* Selection checkbox */}
        <div className="flex pt-1">
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
        </div>

        {/* Audio players section */}
        <div className="flex flex-1 flex-col gap-3">
          {/* A/B Audio comparison */}
          <div className="flex items-center gap-2">
            <AudioPlayer
              label="Original Segment"
              duration={segment.originalDuration}
              score={segment.originalScore}
              variant="original"
              qualityDetails={segment.qualityDetails}
            />

            {segment.hasClip && scoreDelta !== null && (
              <>
                <div className="flex flex-col items-center gap-0.5 px-1">
                  <ArrowRight className="size-4 text-zinc-400" />
                  <span
                    className={cn(
                      "font-medium font-mono text-xs",
                      scoreDelta > 0 ? "text-emerald-600" : "text-zinc-400",
                    )}
                  >
                    {scoreDelta > 0 ? "+" : ""}
                    {scoreDelta.toFixed(1)}
                  </span>
                </div>

                <AudioPlayer
                  label="Processed Clip"
                  duration={segment.processedDuration ?? 0}
                  score={segment.processedScore}
                  variant="processed"
                  qualityDetails={segment.qualityDetails}
                />
              </>
            )}

            {!segment.hasClip && (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-200 border-dashed bg-zinc-50/50 py-6">
                <span className="text-sm text-zinc-400">
                  No processed clip yet
                </span>
              </div>
            )}
          </div>

          {/* Transcription */}
          <div className="min-h-[28px]">
            {segment.transcription ? (
              <p className="text-zinc-700 leading-relaxed">
                <span className="mr-1 text-zinc-400">"</span>
                {parseTranscriptionWithBadges(segment.transcription)}
                <span className="ml-1 text-zinc-400">"</span>
              </p>
            ) : (
              <p className="text-sm text-zinc-400 italic">
                No transcription available
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-zinc-500">Tags</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {segment.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                >
                  {tag}
                </span>
              ))}
              {isAddingTag ? (
                <Select
                  onValueChange={(value) => {
                    console.log("Adding tag:", value);
                    setIsAddingTag(false);
                  }}
                >
                  <SelectTrigger className="h-6 w-28 border-zinc-300 bg-white text-xs">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_TAGS.filter(
                      (t) => !segment.tags.includes(t),
                    ).map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-300 border-dashed px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
                >
                  <Plus className="size-3" />
                  Add
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-zinc-100 border-t bg-zinc-50/50 px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="font-medium font-mono text-xs text-zinc-500">
            #{String(segment.number).padStart(2, "0")}
          </span>
          <span className="text-xs text-zinc-400">Session:</span>
          <span
            className="max-w-[300px] truncate font-mono text-xs text-zinc-600"
            title={segment.sessionName}
          >
            {segment.sessionName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-500">Start</Label>
            <Input
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-6 w-20 border-zinc-200 bg-white px-2 py-0 font-mono text-xs"
            />
          </div>
          <span className="text-zinc-300">-</span>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-500">End</Label>
            <Input
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-6 w-20 border-zinc-200 bg-white px-2 py-0 font-mono text-xs"
            />
          </div>
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium font-mono text-xs text-zinc-600">
            {formatDuration(segment.endTime - segment.startTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Filter Bar -------------------------------------------------------------

interface FilterBarProps {
  filters: {
    hasClip: boolean | null;
    hasTranscription: boolean | null;
    minDuration: number;
    maxDuration: number;
    minQuality: number;
    selectedTag: string | null;
  };
  onFiltersChange: (filters: FilterBarProps["filters"]) => void;
}

function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const activeFiltersCount = [
    filters.hasClip !== null,
    filters.hasTranscription !== null,
    filters.minDuration > 0 || filters.maxDuration < 30,
    filters.minQuality > 0,
    filters.selectedTag !== null,
  ].filter(Boolean).length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-zinc-500" />
          <span className="font-medium text-sm text-zinc-900">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-zinc-900 font-medium font-mono text-[10px] text-white">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-zinc-400 transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-zinc-100 border-t px-4 py-3">
          <div className="flex flex-wrap items-end gap-6">
            {/* Has Clip */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-500">Clip Status</Label>
              <Select
                value={
                  filters.hasClip === null
                    ? "all"
                    : filters.hasClip
                      ? "has"
                      : "missing"
                }
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    hasClip: v === "all" ? null : v === "has",
                  })
                }
              >
                <SelectTrigger className="h-8 w-32 border-zinc-200 bg-zinc-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has clip</SelectItem>
                  <SelectItem value="missing">Missing clip</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Has Transcription */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-500">Transcription</Label>
              <Select
                value={
                  filters.hasTranscription === null
                    ? "all"
                    : filters.hasTranscription
                      ? "has"
                      : "missing"
                }
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    hasTranscription: v === "all" ? null : v === "has",
                  })
                }
              >
                <SelectTrigger className="h-8 w-32 border-zinc-200 bg-zinc-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has transcription</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration Range */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-500">
                Duration: {filters.minDuration}s - {filters.maxDuration}s
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[filters.minDuration, filters.maxDuration]}
                  min={0}
                  max={30}
                  step={0.5}
                  onValueChange={([min, max]) =>
                    onFiltersChange({
                      ...filters,
                      minDuration: min,
                      maxDuration: max,
                    })
                  }
                  className="w-40"
                />
              </div>
            </div>

            {/* Quality Threshold */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-500">
                Min Quality: {filters.minQuality.toFixed(1)}
              </Label>
              <Slider
                value={[filters.minQuality]}
                min={0}
                max={5}
                step={0.1}
                onValueChange={([val]) =>
                  onFiltersChange({ ...filters, minQuality: val })
                }
                className="w-32"
              />
            </div>

            {/* By Tag */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-500">Tag</Label>
              <Select
                value={filters.selectedTag ?? "all"}
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    selectedTag: v === "all" ? null : v,
                  })
                }
              >
                <SelectTrigger className="h-8 w-36 border-zinc-200 bg-zinc-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {AVAILABLE_TAGS.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onFiltersChange({
                    hasClip: null,
                    hasTranscription: null,
                    minDuration: 0,
                    maxDuration: 30,
                    minQuality: 0,
                    selectedTag: null,
                  })
                }
                className="h-8 text-zinc-500"
              >
                <X className="size-3" />
                Clear all
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Duration Histogram -----------------------------------------------------

function DurationHistogram({
  data,
}: {
  data: { range: string; count: number }[];
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1.5">
      {data.map((item) => (
        <Tooltip key={item.range}>
          <TooltipTrigger asChild>
            <div className="flex cursor-help flex-col items-center gap-1">
              <div
                className={cn(
                  "w-8 rounded-sm transition-colors",
                  item.count > 0 ? "bg-zinc-900" : "bg-zinc-200",
                )}
                style={{
                  height: `${Math.max((item.count / maxCount) * 48, 4)}px`,
                }}
              />
              <span className="text-[10px] text-zinc-500">{item.range}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {item.count} segment{item.count !== 1 ? "s" : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// --- Sidebar ----------------------------------------------------------------

interface SidebarProps {
  speaker: typeof MOCK_SPEAKER;
  selectedCount: number;
  onDenoise: () => void;
  onTranscribe: () => void;
}

function Sidebar({
  speaker,
  selectedCount,
  onDenoise,
  onTranscribe,
}: SidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-6">
      {/* Speaker Stats */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-medium text-xs text-zinc-500 uppercase tracking-wide">
          Speaker Statistics
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <FileAudio className="size-4" />
              Total Segments
            </div>
            <span className="font-mono font-semibold text-sm text-zinc-900">
              {speaker.totalSegments}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <Clock className="size-4" />
              Total Duration
            </div>
            <span className="font-mono font-semibold text-sm text-zinc-900">
              {formatDuration(speaker.totalDuration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <Sparkles className="size-4" />
              Avg Quality
            </div>
            <span className="font-mono font-semibold text-sm text-zinc-900">
              {speaker.avgQuality.toFixed(2)}
            </span>
          </div>

          <Separator className="my-2" />

          <div className="space-y-2">
            <span className="font-medium text-xs text-zinc-500">
              Duration Distribution
            </span>
            <DurationHistogram data={speaker.durationDistribution} />
          </div>
        </div>
      </div>

      {/* Processing Operations */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-medium text-xs text-zinc-500 uppercase tracking-wide">
          Processing Operations
        </h2>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 border-zinc-200 text-sm"
            onClick={onDenoise}
            disabled={selectedCount === 0}
          >
            <Wand2 className="size-4" />
            Denoise
            {selectedCount > 0 && (
              <span className="ml-auto font-mono text-xs text-zinc-500">
                {selectedCount} selected
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 border-zinc-200 text-sm"
            onClick={onTranscribe}
            disabled={selectedCount === 0}
          >
            <Volume2 className="size-4" />
            Transcribe
            {selectedCount > 0 && (
              <span className="ml-auto font-mono text-xs text-zinc-500">
                {selectedCount} selected
              </span>
            )}
          </Button>
        </div>

        {selectedCount === 0 && (
          <p className="mt-3 text-xs text-zinc-400">
            Select segments to enable processing operations
          </p>
        )}
      </div>

      {/* Keyboard Shortcuts */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-xs text-zinc-500 uppercase tracking-wide">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Select all</span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              Cmd+A
            </kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Play/Pause</span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              Space
            </kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Next segment</span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              J
            </kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Prev segment</span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              K
            </kbd>
          </div>
        </div>
      </div>
    </aside>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SpeakerDesignLinearPage() {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState({
    hasClip: null as boolean | null,
    hasTranscription: null as boolean | null,
    minDuration: 0,
    maxDuration: 30,
    minQuality: 0,
    selectedTag: null as string | null,
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredSegments = MOCK_SEGMENTS.filter((seg) => {
    if (filters.hasClip !== null && seg.hasClip !== filters.hasClip) {
      return false;
    }
    if (filters.hasTranscription !== null) {
      const hasTranscription = seg.transcription !== null;
      if (hasTranscription !== filters.hasTranscription) {
        return false;
      }
    }
    const duration = seg.endTime - seg.startTime;
    if (duration < filters.minDuration || duration > filters.maxDuration) {
      return false;
    }
    if (seg.originalScore < filters.minQuality) {
      return false;
    }
    if (
      filters.selectedTag !== null &&
      !seg.tags.includes(filters.selectedTag)
    ) {
      return false;
    }
    return true;
  });

  const selectAll = () => {
    setSelectedIds(new Set(filteredSegments.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-zinc-200 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-900">
              <Volume2 className="size-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-zinc-900">
                {MOCK_SPEAKER.name}
              </h1>
              <p className="text-sm text-zinc-500">
                {MOCK_SPEAKER.totalSegments} segments -{" "}
                {formatDuration(MOCK_SPEAKER.totalDuration)} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <span className="mr-2 text-sm text-zinc-500">
                {selectedIds.size} selected
              </span>
            )}
            <Button variant="outline" size="sm" onClick={selectAll}>
              <Check className="size-3.5" />
              Select All
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        {/* Segment List */}
        <div className="flex flex-1 flex-col gap-4">
          <FilterBar filters={filters} onFiltersChange={setFilters} />

          {/* Results count */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              Showing {filteredSegments.length} of {MOCK_SEGMENTS.length}{" "}
              segments
            </span>
          </div>

          {/* Segments */}
          <div className="flex flex-col gap-3">
            {filteredSegments.map((segment) => (
              <SegmentCard
                key={segment.id}
                segment={segment}
                isSelected={selectedIds.has(segment.id)}
                onToggleSelect={() => toggleSelect(segment.id)}
              />
            ))}

            {filteredSegments.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-300 border-dashed bg-white py-16">
                <Filter className="size-8 text-zinc-300" />
                <p className="mt-3 text-sm text-zinc-500">
                  No segments match your filters
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFilters({
                      hasClip: null,
                      hasTranscription: null,
                      minDuration: 0,
                      maxDuration: 30,
                      minQuality: 0,
                      selectedTag: null,
                    })
                  }
                  className="mt-2"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar
          speaker={MOCK_SPEAKER}
          selectedCount={selectedIds.size}
          onDenoise={() => console.log("Denoise", Array.from(selectedIds))}
          onTranscribe={() =>
            console.log("Transcribe", Array.from(selectedIds))
          }
        />
      </main>
    </div>
  );
}

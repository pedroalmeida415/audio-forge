"use client";

import { Download, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

export function ExportDialog({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [sourceId] = useQueryState("sourceId", workspaceParams.sourceId);
  const [activeSpeakerId] = useQueryState(
    "speakerId",
    workspaceParams.speakerId,
  );

  const [open, setOpen] = useState(false);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [sampleRate, setSampleRate] = useState<number>(24000);

  const [durationRange, setDurationRange] = useState<[number, number]>([0, 30]);
  const [scoreRange, setScoreRange] = useState<[number, number]>([1, 5]);
  const [hasSetDefaultsForSpeaker, setHasSetDefaultsForSpeaker] =
    useState<string>("");

  const [exportStatus, setExportStatus] = useState<
    "idle" | "processing" | "completed" | "failed"
  >("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync active speaker when dialog opens
  useEffect(() => {
    if (open && activeSpeakerId && !selectedSpeakerId) {
      setSelectedSpeakerId(activeSpeakerId);
    }
  }, [open, activeSpeakerId, selectedSpeakerId]);

  // Reset state gracefully when hidden
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setExportStatus("idle");
        setDownloadUrl(null);
        setErrorMsg(null);
        setSampleRate(24000);
        setDurationRange([0, 30]);
        setScoreRange([1, 5]);
        setHasSetDefaultsForSpeaker("");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const { data: projectSpeakers = [] } = api.speaker.getByProject.useQuery(
    { projectId },
    { enabled: open, refetchOnWindowFocus: false },
  );

  const { data: sourceSpeakers = [] } = api.speaker.getBySource.useQuery(
    { sourceId: sourceId ?? "" },
    { enabled: open && !!sourceId, refetchOnWindowFocus: false },
  );

  const { data: segmentsData } = api.segment.getBySpeaker.useQuery(
    { speakerId: selectedSpeakerId },
    { enabled: open && !!selectedSpeakerId, refetchOnWindowFocus: false },
  );

  const exportableSegments =
    segmentsData?.segments.filter(
      (s) =>
        s.clip?.storageKey != null &&
        s.transcription != null &&
        s.transcription.trim().length > 0,
    ) ?? [];

  const maxPossibleDuration = Math.max(
    10,
    Math.ceil(
      exportableSegments.length > 0
        ? Math.max(...exportableSegments.map((s) => s.endTime - s.startTime))
        : 30,
    ),
  );

  useEffect(() => {
    if (
      selectedSpeakerId &&
      exportableSegments.length > 0 &&
      hasSetDefaultsForSpeaker !== selectedSpeakerId
    ) {
      setDurationRange([0, maxPossibleDuration]);
      setScoreRange([1, 5]);
      setHasSetDefaultsForSpeaker(selectedSpeakerId);
    }
  }, [
    selectedSpeakerId,
    exportableSegments.length,
    maxPossibleDuration,
    hasSetDefaultsForSpeaker,
  ]);

  const filteredSegments = exportableSegments.filter((s) => {
    const durRaw = s.endTime - s.startTime;
    const dur = Number(durRaw.toFixed(1));
    if (dur < durationRange[0] || dur > durationRange[1]) return false;

    type ScoreData = { DNSMOS?: { P808_MOS?: number } };
    const clipScores = s.clip?.scores as ScoreData | null;
    const rawScore = clipScores?.DNSMOS?.P808_MOS;

    const isFullScoreRange = scoreRange[0] <= 1 && scoreRange[1] >= 5;
    if (rawScore == null) {
      if (!isFullScoreRange) return false;
    } else {
      const score = Number(rawScore.toFixed(1));
      if (score < scoreRange[0] || score > scoreRange[1]) return false;
    }

    return true;
  });

  const totalFilteredDuration = filteredSegments.reduce(
    (sum, s) => sum + (s.endTime - s.startTime),
    0,
  );

  const allSpeakers = [...projectSpeakers, ...sourceSpeakers];
  const uniqueSpeakers = Array.from(
    new Map(allSpeakers.map((s) => [s.id, s])).values(),
  );

  const exportMutation = api.export.startLJSpeechExport.useMutation({
    onSuccess: (data) => {
      setExportStatus("processing");
    },
    onError: (err) => {
      setExportStatus("failed");
      setErrorMsg(err.message);
    },
  });

  const handleExport = () => {
    if (!selectedSpeakerId) return;
    exportMutation.mutate({
      speakerId: selectedSpeakerId,
      sampleRate,
      minDuration: durationRange[0],
      maxDuration: durationRange[1],
      minScore: scoreRange[0],
      maxScore: scoreRange[1],
    });
  };

  const isExporting = exportMutation.isPending || exportStatus === "processing";
  const isCompleted = exportStatus === "completed";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Dataset</DialogTitle>
          <DialogDescription>
            Export clips for a specific speaker as an LJSpeech formatted
            dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Speaker</Label>
            <Select
              value={selectedSpeakerId}
              onValueChange={setSelectedSpeakerId}
              disabled={isExporting || isCompleted}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a speaker" />
              </SelectTrigger>
              <SelectContent>
                {uniqueSpeakers.map((speaker) => (
                  <SelectItem key={speaker.id} value={speaker.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: speaker.color }}
                      />
                      {speaker.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Sample Rate</Label>
            <Select
              value={sampleRate.toString()}
              onValueChange={(v) => setSampleRate(Number.parseInt(v, 10))}
              disabled={isExporting || isCompleted}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8000">8000 Hz</SelectItem>
                <SelectItem value="16000">16000 Hz</SelectItem>
                <SelectItem value="22050">22050 Hz</SelectItem>
                <SelectItem value="24000">24000 Hz</SelectItem>
                <SelectItem value="44100">44100 Hz</SelectItem>
                <SelectItem value="48000">48000 Hz</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-6 py-2">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label>Duration Range (s)</Label>
                <span className="font-medium text-muted-foreground text-sm">
                  {durationRange[0].toFixed(1)}s - {durationRange[1].toFixed(1)}
                  s
                </span>
              </div>
              <Slider
                min={0}
                max={maxPossibleDuration}
                step={0.1}
                value={durationRange}
                onValueChange={(v) => setDurationRange(v as [number, number])}
                disabled={isExporting || isCompleted}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between">
                <Label>Score Range (MOS)</Label>
                <span className="font-medium text-muted-foreground text-sm">
                  {scoreRange[0].toFixed(1)} - {scoreRange[1].toFixed(1)}
                </span>
              </div>
              <Slider
                min={1}
                max={5}
                step={0.1}
                value={scoreRange}
                onValueChange={(v) => setScoreRange(v as [number, number])}
                disabled={isExporting || isCompleted}
              />
            </div>
          </div>

          <div className="mt-2 rounded-md border bg-muted/50 p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Export Summary</span>
              <span className="font-medium">
                {filteredSegments.length} segments (
                {totalFilteredDuration.toFixed(1)}s)
              </span>
            </div>
          </div>

          {isExporting && (
            <div className="space-y-2 pt-4">
              <div className="flex justify-center text-sm">
                <span>Processing clips...</span>
              </div>
            </div>
          )}

          {exportStatus === "failed" && (
            <div className="pt-2 text-destructive text-sm">
              Error: {errorMsg}
            </div>
          )}
        </div>

        <DialogFooter>
          {isCompleted && downloadUrl ? (
            <Button asChild className="w-full">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Download className="mr-2 size-4" />
                Download Dataset (.zip)
              </a>
            </Button>
          ) : (
            <Button
              onClick={handleExport}
              disabled={!selectedSpeakerId || isExporting}
              className="w-full"
            >
              {isExporting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isExporting ? "Exporting..." : "Start Export"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

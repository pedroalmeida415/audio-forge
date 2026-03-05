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
import { Progress } from "~/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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

  const [jobId, setJobId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
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
        setJobId(null);
        setExportProgress(0);
        setExportStatus("idle");
        setDownloadUrl(null);
        setErrorMsg(null);
        setSampleRate(24000);
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

  const allSpeakers = [...projectSpeakers, ...sourceSpeakers];
  const uniqueSpeakers = Array.from(
    new Map(allSpeakers.map((s) => [s.id, s])).values(),
  );

  const exportMutation = api.export.startLJSpeechExport.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      setExportStatus("processing");
      setExportProgress(0);
    },
    onError: (err) => {
      setExportStatus("failed");
      setErrorMsg(err.message);
    },
  });

  api.export.onExportProgress.useSubscription(
    { jobId: jobId ?? "" },
    {
      enabled: !!jobId && exportStatus === "processing",
      onData: (data) => {
        if (data.total > 0) {
          setExportProgress(Math.round((data.processed / data.total) * 100));
        }

        if (data.status === "completed") {
          setExportStatus("completed");
          setExportProgress(100);
          setDownloadUrl(data.downloadUrl ?? null);
        } else if (data.status === "failed") {
          setExportStatus("failed");
          setErrorMsg(data.error ?? "Export failed");
        }
      },
      onError: (err) => {
        setExportStatus("failed");
        setErrorMsg(err.message);
      },
    },
  );

  const handleExport = () => {
    if (!selectedSpeakerId) return;
    exportMutation.mutate({ speakerId: selectedSpeakerId, sampleRate });
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

          {isExporting && (
            <div className="space-y-2 pt-4">
              <div className="flex justify-between text-sm">
                <span>Processing clips...</span>
                <span>{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
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

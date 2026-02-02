"use client";

import { useValue } from "@legendapp/state/react";
import {
  Download,
  Loader2,
  MessageSquare,
  Scissors,
  Volume2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { ExportProgressDialog } from "./export-progress-dialog";
import { SpeakerStatsCard } from "./speaker-stats-card";

const SAMPLE_RATES = [
  { value: "8000", label: "8 kHz" },
  { value: "16000", label: "16 kHz" },
  { value: "22050", label: "22.05 kHz" },
  { value: "24000", label: "24 kHz (Recommended)" },
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
] as const;

export function SpeakerSidebar() {
  const { speakerId } = useParams<{ speakerId: string }>();
  const $store = useSpeakerPageStore();
  const selectedIds = useValue($store.selectedSegmentIds);

  const hasSelection = selectedIds.size > 0;

  const [processingOperation, setProcessingOperation] = useState<string | null>(
    null,
  );

  // Export state
  const [sampleRate, setSampleRate] = useState("24000");
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const exportMutation = api.export.startLJSpeechExport.useMutation({
    onSuccess: (data) => {
      setExportJobId(data.jobId);
      setShowExportDialog(true);
    },
  });

  const handleExport = () => {
    exportMutation.mutate({
      speakerId,
      sampleRate: Number.parseInt(sampleRate, 10),
    });
  };

  const queueMutation = api.segment.queueProcessing.useMutation({
    onMutate: (variables) => {
      $store.markClipsPending(variables.segmentIds);
    },
    onSuccess: (data) => {
      console.log("Queued:", data.jobIds.length, "jobs");
      setProcessingOperation(null);
      $store.clearSelection();
    },
    onError: (_error, variables) => {
      for (const id of variables.segmentIds) {
        $store.markClipComplete(id);
      }
      setProcessingOperation(null);
    },
  });

  const handleProcess = (
    operation: "denoise" | "remove_overlap" | "transcribe",
  ) => {
    if (!hasSelection) return;
    setProcessingOperation(operation);
    queueMutation.mutate({
      segmentIds: Array.from(selectedIds),
      operation,
    });
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5">
      <SpeakerStatsCard />

      {/* Processing Operations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">
            Processing Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            onClick={() => handleProcess("denoise")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "denoise" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Volume2 className="size-4" />
            )}
            Denoise
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleProcess("remove_overlap")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "remove_overlap" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Scissors className="size-4" />
            )}
            Remove Overlap
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleProcess("transcribe")}
            disabled={!hasSelection || queueMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {processingOperation === "transcribe" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            Transcribe
            {hasSelection && (
              <span className="ml-auto font-mono text-primary text-xs">
                {selectedIds.size} selected
              </span>
            )}
          </Button>

          {!hasSelection && (
            <p className="mt-4 text-muted-foreground text-xs">
              Select segments to enable processing operations
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export Dataset */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">Export Dataset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="sample-rate"
              className="text-muted-foreground text-xs"
            >
              Sample Rate
            </label>
            <Select value={sampleRate} onValueChange={setSampleRate}>
              <SelectTrigger id="sample-rate" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_RATES.map((rate) => (
                  <SelectItem key={rate.value} value={rate.value}>
                    {rate.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="h-10 w-full justify-start gap-2.5"
          >
            {exportMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export LJSpeech
          </Button>

          <p className="text-muted-foreground text-xs">
            Exports segments with clips and transcriptions. Ensure
            transcriptions are normalized (numbers spelled out, abbreviations
            expanded) before exporting.
          </p>
        </CardContent>
      </Card>

      {/* Export Progress Dialog */}
      <ExportProgressDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        jobId={exportJobId}
      />
    </aside>
  );
}

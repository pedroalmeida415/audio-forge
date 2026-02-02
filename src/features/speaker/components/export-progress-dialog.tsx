"use client";

import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Progress } from "~/components/ui/progress";
import { api } from "~/trpc/react";

interface ExportProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
}

export function ExportProgressDialog({
  open,
  onOpenChange,
  jobId,
}: ExportProgressDialogProps) {
  const [status, setStatus] = useState<
    "processing" | "completed" | "failed" | "idle"
  >("idle");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [skippedCount, setSkippedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens with a new job
  useEffect(() => {
    if (open && jobId) {
      setStatus("processing");
      setProcessed(0);
      setTotal(0);
      setDownloadUrl(null);
      setFileCount(null);
      setTotalDuration(null);
      setSkippedCount(null);
      setError(null);
    }
  }, [open, jobId]);

  // Subscribe to export progress
  api.export.onExportProgress.useSubscription(
    { jobId: jobId ?? "" },
    {
      enabled: open && !!jobId && status === "processing",
      onData: (event) => {
        setProcessed(event.processed);
        setTotal(event.total);
        setStatus(event.status);

        if (event.status === "completed") {
          setDownloadUrl(event.downloadUrl ?? null);
          setFileCount(event.fileCount ?? null);
          setTotalDuration(event.totalDuration ?? null);
          setSkippedCount(event.skippedCount ?? null);
        }

        if (event.status === "failed") {
          setError(event.error ?? "Export failed");
        }
      },
      onError: (err) => {
        setStatus("failed");
        setError(err.message);
      },
    },
  );

  const progressPercent = total > 0 ? (processed / total) * 100 : 0;

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset to idle after closing
    setTimeout(() => setStatus("idle"), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {status === "processing" && "Exporting Dataset..."}
            {status === "completed" && "Export Complete"}
            {status === "failed" && "Export Failed"}
            {status === "idle" && "Export Dataset"}
          </DialogTitle>
          <DialogDescription>
            {status === "processing" && "Creating LJSpeech dataset ZIP file"}
            {status === "completed" && "Your dataset is ready for download"}
            {status === "failed" && "There was an error during export"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {status === "processing" && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm">
                  Processing segment {processed} of {total || "..."}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </>
          )}

          {status === "completed" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle2 className="size-5" />
                <span className="font-medium text-sm">
                  Successfully exported {fileCount} files
                </span>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
                <div className="flex justify-between">
                  <span>Files exported:</span>
                  <span className="font-mono">{fileCount}</span>
                </div>
                {totalDuration !== null && (
                  <div className="flex justify-between">
                    <span>Total duration:</span>
                    <span className="font-mono">
                      {formatDuration(totalDuration)}
                    </span>
                  </div>
                )}
                {skippedCount !== null && skippedCount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Segments skipped:</span>
                    <span className="font-mono">{skippedCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="size-5" />
                <span className="font-medium text-sm">Export failed</span>
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {status === "completed" && downloadUrl && (
            <Button onClick={handleDownload} className="gap-2">
              <Download className="size-4" />
              Download ZIP
            </Button>
          )}
          <Button
            variant={status === "completed" ? "outline" : "default"}
            onClick={handleClose}
          >
            {status === "processing" ? "Cancel" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

"use client";

import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  FileAudio,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const ACCEPTED_AUDIO_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/webm": [".webm"],
  "audio/mp4": [".m4a"],
  "audio/x-m4a": [".m4a"],
};

type UploadState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "uploading"; progress: number }
  | { status: "confirming" }
  | { status: "transferring" }
  | { status: "starting" }
  | { status: "success"; jobId: string }
  | { status: "error"; message: string };

type DiarizationContentProps = {
  onSuccess?: (jobId: string) => void;
};

export function DiarizationContent({ onSuccess }: DiarizationContentProps) {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const createJobMutation = api.diarization.createJob.useMutation();
  const confirmUploadMutation = api.diarization.confirmUpload.useMutation();
  const startProcessingMutation = api.diarization.startProcessing.useMutation();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setUploadState({ status: "idle" });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_AUDIO_TYPES,
    maxFiles: 1,
    multiple: false,
  });

  async function handleStartUpload() {
    if (!selectedFile) {
      return;
    }

    try {
      // Step 1: Create job and get presigned URL
      setUploadState({ status: "creating" });
      const { jobId, uploadUrl, storageKey } =
        await createJobMutation.mutateAsync({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          fileSizeBytes: selectedFile.size,
        });

      // Step 2: Upload file directly to MinIO
      setUploadState({ status: "uploading", progress: 0 });
      await uploadFileWithProgress(selectedFile, uploadUrl, (progress) => {
        setUploadState({ status: "uploading", progress });
      });

      // Step 3: Confirm upload
      setUploadState({ status: "confirming" });
      await confirmUploadMutation.mutateAsync({ jobId });

      // Step 4: Transfer to Pyannote
      setUploadState({ status: "transferring" });
      const transferResponse = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          contentType: selectedFile.type || "audio/mpeg",
        }),
      });

      if (!transferResponse.ok) {
        const error = await transferResponse.json();
        throw new Error(error.error ?? "Failed to transfer file");
      }

      const { mediaUrl } = await transferResponse.json();

      // Step 5: Start Pyannote processing
      setUploadState({ status: "starting" });
      await startProcessingMutation.mutateAsync({
        jobId,
        pyannoteMediaUrl: mediaUrl,
      });

      setUploadState({ status: "success", jobId });

      if (onSuccess) {
        onSuccess(jobId);
      } else {
        // Navigate to clipping workspace after short delay
        setTimeout(() => {
          router.push(`/clipping/${jobId}`);
        }, 1500);
      }
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  function uploadFileWithProgress(
    file: File,
    url: string,
    onProgress: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });
  }

  const isProcessing =
    uploadState.status !== "idle" &&
    uploadState.status !== "success" &&
    uploadState.status !== "error";

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed p-10 text-center transition-all duration-300",
          isDragActive
            ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(245,166,35,0.15)]"
            : "border-border/50 hover:border-primary/50 hover:bg-secondary/30",
          isProcessing && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} disabled={isProcessing} />

        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="relative">
          <div
            className={cn(
              "mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl transition-all duration-300",
              isDragActive
                ? "bg-primary/20 text-primary"
                : "bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
            )}
          >
            <CloudUpload className="size-8" />
          </div>

          {isDragActive ? (
            <p className="font-medium text-primary">
              Drop the audio file here...
            </p>
          ) : (
            <>
              <p className="mb-2 font-medium text-foreground">
                Drag and drop an audio file, or click to browse
              </p>
              <p className="text-muted-foreground text-sm">
                Supported: MP3, WAV, FLAC, OGG, WebM, M4A
              </p>
            </>
          )}
        </div>
      </div>

      {/* Selected file info */}
      {selectedFile && uploadState.status === "idle" && (
        <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileAudio className="size-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{selectedFile.name}</p>
            <p className="text-muted-foreground text-sm">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        </div>
      )}

      {/* Progress states */}
      {uploadState.status === "creating" && (
        <StatusMessage icon={Loader2} spinning>
          Creating job...
        </StatusMessage>
      )}

      {uploadState.status === "uploading" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploading...</span>
            <span className="font-medium text-primary">
              {uploadState.progress}%
            </span>
          </div>
          <Progress value={uploadState.progress} />
        </div>
      )}

      {uploadState.status === "confirming" && (
        <StatusMessage icon={Loader2} spinning>
          Confirming upload...
        </StatusMessage>
      )}

      {uploadState.status === "transferring" && (
        <StatusMessage icon={Loader2} spinning>
          Transferring to diarization service...
        </StatusMessage>
      )}

      {uploadState.status === "starting" && (
        <StatusMessage icon={Loader2} spinning>
          Starting diarization...
        </StatusMessage>
      )}

      {uploadState.status === "success" && (
        <StatusMessage icon={CheckCircle2} variant="success">
          Job started! Redirecting to workspace...
        </StatusMessage>
      )}

      {uploadState.status === "error" && (
        <StatusMessage icon={AlertCircle} variant="error">
          {uploadState.message}
        </StatusMessage>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {uploadState.status === "error" && (
          <Button
            onClick={() => setUploadState({ status: "idle" })}
            variant="outline"
          >
            Try Again
          </Button>
        )}
        <Button
          disabled={!selectedFile || isProcessing}
          onClick={handleStartUpload}
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 size-5 animate-spin" />
              Processing...
            </>
          ) : (
            "Start Diarization"
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusMessage({
  children,
  icon: Icon,
  spinning,
  variant = "default",
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  spinning?: boolean;
  variant?: "default" | "success" | "error";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 text-sm",
        variant === "default" &&
          "border-border/50 bg-secondary/30 text-muted-foreground",
        variant === "success" && "border-success/30 bg-success/10 text-success",
        variant === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <Icon className={cn("size-5 shrink-0", spinning && "animate-spin")} />
      <span className="font-medium">{children}</span>
    </div>
  );
}

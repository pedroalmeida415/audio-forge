"use client";

import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
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
          "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          isProcessing && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} disabled={isProcessing} />
        <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-muted-foreground">Drop the audio file here...</p>
        ) : (
          <>
            <p className="mb-1 text-muted-foreground">
              Drag and drop an audio file, or click to browse
            </p>
            <p className="text-muted-foreground text-xs">
              Supported: MP3, WAV, FLAC, OGG, WebM, M4A
            </p>
          </>
        )}
      </div>

      {/* Selected file info */}
      {selectedFile && uploadState.status === "idle" && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="font-medium text-sm">{selectedFile.name}</p>
          <p className="text-muted-foreground text-xs">
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      )}

      {/* Progress states */}
      {uploadState.status === "creating" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating job...
        </div>
      )}

      {uploadState.status === "uploading" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploading...</span>
            <span>{uploadState.progress}%</span>
          </div>
          <Progress value={uploadState.progress} />
        </div>
      )}

      {uploadState.status === "confirming" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Confirming upload...
        </div>
      )}

      {uploadState.status === "transferring" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Transferring to diarization service...
        </div>
      )}

      {uploadState.status === "starting" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting diarization...
        </div>
      )}

      {uploadState.status === "success" && (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Job started! Redirecting to workspace...
        </div>
      )}

      {uploadState.status === "error" && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {uploadState.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
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
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

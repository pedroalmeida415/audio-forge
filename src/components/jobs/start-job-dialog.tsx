"use client";

import { FileAudio, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
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
import { Progress } from "~/components/ui/progress";
import { api } from "~/trpc/react";

interface StartJobDialogProps {
  projectId: string;
  children: React.ReactNode;
}

interface FileWithProgress {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
  audioFileId?: string;
}

const MAX_FILES = 10;
const ACCEPTED_TYPES = {
  "audio/*": [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"],
};

export function StartJobDialog({ projectId, children }: StartJobDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const createJob = api.diarization.createJob.useMutation();
  const getUploadUrl = api.diarization.getUploadUrl.useMutation();
  const confirmUpload = api.diarization.confirmUpload.useMutation();
  const startProcessing = api.diarization.startProcessing.useMutation();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.slice(0, MAX_FILES - files.length);
      const fileWithProgress = newFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));
      setFiles((prev) => [...prev, ...fileWithProgress]);
    },
    [files.length]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: MAX_FILES,
    disabled: isUploading || files.length >= MAX_FILES,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (
    fileWithProgress: FileWithProgress,
    currentJobId: string,
    index: number
  ): Promise<void> => {
    const { file } = fileWithProgress;

    try {
      // Get presigned URL
      const { uploadUrl, audioFileId } = await getUploadUrl.mutateAsync({
        jobId: currentJobId,
        filename: file.name,
        contentType: file.type || "audio/mpeg",
        fileSizeBytes: file.size,
      });

      // Update status
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploading" as const, audioFileId } : f
        )
      );

      // Upload to MinIO with XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f, i) => (i === index ? { ...f, progress } : f))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.send(file);
      });

      // Confirm upload
      await confirmUpload.mutateAsync({ audioFileId });

      // Update status to uploaded
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploaded" as const, progress: 100 } : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f
        )
      );
      throw error;
    }
  };

  const handleStartJob = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Create job
      const job = await createJob.mutateAsync({ projectId });
      setJobId(job!.id);

      // Upload all files
      await Promise.all(
        files.map((file, index) => uploadFile(file, job!.id, index))
      );

      // Start processing
      await startProcessing.mutateAsync({ jobId: job!.id });

      // Navigate to job page
      router.push(`/projects/${projectId}/jobs/${job!.id}`);
      setOpen(false);
    } catch (error) {
      console.error("Failed to start job:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isUploading) {
      setOpen(isOpen);
      if (!isOpen) {
        setFiles([]);
        setJobId(null);
      }
    }
  };

  const allUploaded =
    files.length > 0 && files.every((f) => f.status === "uploaded");
  const hasErrors = files.some((f) => f.status === "error");
  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
      : 0;

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Start Diarization Job</DialogTitle>
          <DialogDescription>
            Upload audio files to process. Maximum {MAX_FILES} files per job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragActive
                ? "border-primary bg-primary/10"
                : files.length >= MAX_FILES
                  ? "cursor-not-allowed border-muted bg-muted/50"
                  : "border-muted hover:border-primary"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            {files.length >= MAX_FILES ? (
              <p className="text-muted-foreground">Maximum files reached</p>
            ) : isDragActive ? (
              <p>Drop files here...</p>
            ) : (
              <>
                <p>Drag & drop audio files, or click to select</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  MP3, WAV, M4A, FLAC, OGG supported
                </p>
              </>
            )}
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((fileWithProgress, index) => (
                <div
                  className="flex items-center gap-3 rounded-lg border p-3"
                  key={`${fileWithProgress.file.name}-${index}`}
                >
                  <FileAudio className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {fileWithProgress.file.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {(fileWithProgress.file.size / (1024 * 1024)).toFixed(1)}{" "}
                      MB
                    </p>
                    {fileWithProgress.status === "uploading" && (
                      <Progress
                        className="mt-1 h-1"
                        value={fileWithProgress.progress}
                      />
                    )}
                    {fileWithProgress.status === "error" && (
                      <p className="text-destructive text-xs">
                        {fileWithProgress.error}
                      </p>
                    )}
                  </div>
                  {fileWithProgress.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {fileWithProgress.status === "uploaded" && (
                    <span className="text-green-600 text-xs">Uploaded</span>
                  )}
                  {!isUploading && fileWithProgress.status === "pending" && (
                    <Button
                      onClick={() => removeFile(index)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Overall progress */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Uploading files...</span>
                <span>{totalProgress}%</span>
              </div>
              <Progress value={totalProgress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isUploading}
            onClick={() => handleClose(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={files.length === 0 || isUploading}
            onClick={handleStartJob}
            type="button"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              `Start Job (${files.length} file${files.length !== 1 ? "s" : ""})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

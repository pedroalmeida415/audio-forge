import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "~/trpc/react";

export type FileWithProgress = {
  file: File;
  progress: number;
  status:
    | "pending"
    | "uploading"
    | "uploaded"
    | "transferring"
    | "processing"
    | "complete"
    | "error";
  error?: string;
  jobId?: string;
};

export const MAX_FILES = 10;
export const ACCEPTED_TYPES = {
  "audio/*": [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"],
};

type UseJobUploadParams = {
  projectId: string;
  onSuccess?: (jobId?: string) => void;
};

type UseJobUploadReturn = {
  files: FileWithProgress[];
  isUploading: boolean;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  startJob: () => Promise<void>;
  totalProgress: number;
  hasErrors: boolean;
  allComplete: boolean;
};

/**
 * Helper function to transfer a file from MinIO to Pyannote
 */
async function transferFile(
  storageKey: string,
  mimeType: string
): Promise<string> {
  const transferResponse = await fetch("/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey,
      contentType: mimeType,
    }),
  });

  if (!transferResponse.ok) {
    throw new Error(`Transfer failed: ${transferResponse.statusText}`);
  }

  const { mediaUrl } = (await transferResponse.json()) as {
    mediaUrl: string;
  };

  return mediaUrl;
}

export function useJobUpload({
  projectId,
  onSuccess,
}: UseJobUploadParams): UseJobUploadReturn {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const createJob = api.diarization.createJob.useMutation();
  const confirmUpload = api.diarization.confirmUpload.useMutation();
  const startProcessing = api.diarization.startProcessing.useMutation();

  const addFiles = (newFiles: File[]) => {
    const filesToAdd = newFiles.slice(0, MAX_FILES - files.length);
    const fileWithProgress = filesToAdd.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...fileWithProgress]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Process a single file: create job, upload, transfer, and start processing
   */
  const processFile = async (
    fileWithProgress: FileWithProgress,
    index: number
  ): Promise<void> => {
    const { file } = fileWithProgress;

    try {
      // Step 1: Create job for this file (returns jobId + uploadUrl)
      const result = await createJob.mutateAsync({
        projectId,
        filename: file.name,
        contentType: file.type || "audio/mpeg",
        fileSizeBytes: file.size,
      });

      const jobId = result?.jobId;
      const uploadUrl = result?.uploadUrl;
      const storageKey = result?.storageKey;

      if (!(jobId && uploadUrl && storageKey)) {
        throw new Error("Failed to create job");
      }

      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, jobId } : f))
      );

      // Step 2: Upload to MinIO
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploading" as const } : f
        )
      );

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

      // Step 3: Confirm upload
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploaded" as const, progress: 100 } : f
        )
      );

      await confirmUpload.mutateAsync({
        jobId,
        // Audio metadata can be added here if available
      });

      // Step 4: Transfer file to Pyannote
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "transferring" as const } : f
        )
      );

      const mediaUrl = await transferFile(
        storageKey,
        file.type || "audio/mpeg"
      );

      // Step 5: Start Pyannote processing
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "processing" as const } : f
        )
      );

      await startProcessing.mutateAsync({
        jobId,
        pyannoteMediaUrl: mediaUrl,
      });

      // Mark as complete
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "complete" as const } : f
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

  const startJob = async (): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      // Process all files in parallel (each creates its own job)
      await Promise.allSettled(
        files.map((file, index) => processFile(file, index))
      );

      // Get the first successful job ID for navigation (if single file)
      const firstJobId = files.find((f) => f.jobId)?.jobId;

      // Navigate to project page when done
      if (onSuccess) {
        onSuccess(firstJobId);
      } else {
        router.push(`/projects/${projectId}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const allComplete =
    files.length > 0 && files.every((f) => f.status === "complete");
  const hasErrors = files.some((f) => f.status === "error");
  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
      : 0;

  return {
    files,
    isUploading,
    addFiles,
    removeFile,
    startJob,
    totalProgress,
    hasErrors,
    allComplete,
  };
}
